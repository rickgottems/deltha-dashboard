// ============================================================
// Orquestração da importação de NF-e: varre uma pasta, parseia cada XML
// (nfeParser.ts), deduplica por chave de acesso (ImportedDocument) e grava
// Client/Product/Sale/Receivable de forma transacional por arquivo.
//
// DECISÃO DE GRANULARIDADE: 1 Sale POR ITEM da NF-e (não agregado por nota).
// O ranking "Produtos mais vendidos" da aba Vendas (routes/vendas.ts) agrupa
// por productId — agregar tudo num único Sale com productId=null inutilizaria
// esse ranking para dados importados. Efeito colateral aceito: a soma de
// Sale.amount de uma nota pode não bater 100% com o vNF total (frete/desconto
// não distribuído por item) — o Financeiro usa Receivable para receita
// reconhecida, não a soma de Sale.amount, então isso não afeta o DRE.
// ============================================================

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { isPagamentoQuitadoNaEmissao, parseNfeFile, type ParsedNfe } from './nfeParser.js';

// Tipo correto do client transacional passado por prisma.$transaction(async (tx) => ...).
// Usar isto (em vez de `typeof prisma` + cast) garante que os helpers só
// aceitem um client já dentro de uma transação — e que o compilador barre,
// em vez de mascarar, uma chamada futura a método fora do escopo transacional
// (ex.: tx.$transaction/$connect, que não existem em TransactionClient).
type TxClient = Prisma.TransactionClient;

export interface NfeImportResult {
  arquivo: string;
  status: 'IMPORTADO' | 'JA_IMPORTADO' | 'IGNORADO_NAO_NFE' | 'ERRO';
  detalhe?: string;
}

async function listXmlFiles(dirPath: string): Promise<string[]> {
  // fs.Dirent.parentPath é garantido (Node 20.12+/22+ — este projeto roda em
  // Node 24, ver package.json/CLAUDE.md). Sem fallback via `as any`: se a
  // premissa de versão do Node mudar, é melhor falhar alto e claro aqui do
  // que produzir um path errado silenciosamente.
  const entries = await readdir(dirPath, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.xml'))
    .map((e) => join(e.parentPath, e.name));
}

/** Upsert de Product por NOME (não cProd — código do fornecedor pode ser reaproveitado por sistemas diferentes). */
async function upsertProductByName(tx: TxClient, xProd: string, vUnCom: number) {
  const existing = await tx.product.findFirst({ where: { name: xProd } });
  if (existing) return existing;
  // TODO-NEGOCIO: produto criado automaticamente por NF-e nasce com costPrice=0.
  // Até alguém completar o preço de custo manualmente em Configurações → Produtos,
  // a margem de contribuição desse produto aparece como 100% (distorce o KPI do Executivo).
  return tx.product.create({ data: { name: xProd, costPrice: 0, salePrice: vUnCom, active: true } });
}

/** Upsert de Client por CNPJ (nome de empresa varia entre notas; CNPJ é a chave de negócio real). */
async function upsertClientByCnpj(tx: TxClient, cnpj: string | null, nome: string) {
  if (!cnpj) {
    // Caso raro (sem CNPJ nem CPF no destinatário): evita duplicar demais buscando por nome primeiro.
    const existing = await tx.client.findFirst({ where: { name: nome } });
    return existing ?? tx.client.create({ data: { name: nome } });
  }
  return tx.client.upsert({
    where: { cnpj },
    update: { name: nome },
    create: { cnpj, name: nome },
  });
}

async function importOneNfe(nfe: ParsedNfe, filePath: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const client = await upsertClientByCnpj(tx, nfe.destCnpj, nfe.destNome);

    const saleIds: string[] = [];
    for (const item of nfe.itens) {
      const product = await upsertProductByName(tx, item.xProd, item.vUnCom);
      const sale = await tx.sale.create({
        data: {
          productId: product.id,
          clientId: client.id,
          sellerId: null, // "Vendedor:" em infCpl é texto livre inconsistente entre emissores — não parsear
          // Sale.quantity é Int no schema; qCom já vem garantido finito pelo
          // parser (requireFiniteNumber), mas itens vendidos por peso/volume
          // têm qCom fracionário (ex.: 0.5) — arredondamos, o que é uma perda
          // de precisão aceita (limitação conhecida: schema não suporta
          // quantidade fracionária). O mínimo de 1 evita gravar quantidade 0
          // em casos de brinde/amostra grátis.
          quantity: Math.max(1, Math.round(item.qCom)),
          amount: item.vProd,
          date: nfe.dhEmi,
          source: 'NFE',
        },
      });
      saleIds.push(sale.id);
    }

    const receivableIds: string[] = [];
    if (nfe.duplicatas.length > 0) {
      for (const dup of nfe.duplicatas) {
        const r = await tx.receivable.create({
          data: {
            clientId: client.id,
            description: `NF-e ${nfe.numeroNota} parcela ${dup.nDup}`,
            category: 'Vendas NF-e',
            amount: dup.vDup,
            dueDate: dup.dVenc,
            status: 'PENDENTE',
            source: 'NFE',
          },
        });
        receivableIds.push(r.id);
      }
    } else if (nfe.pagamentoAvista) {
      const quitado = isPagamentoQuitadoNaEmissao(nfe.pagamentoAvista.tPag);
      const r = await tx.receivable.create({
        data: {
          clientId: client.id,
          description: `NF-e ${nfe.numeroNota}`,
          category: 'Vendas NF-e',
          amount: nfe.pagamentoAvista.vPag,
          dueDate: nfe.dhEmi,
          paidDate: quitado ? nfe.dhEmi : null,
          status: quitado ? 'PAGA' : 'PENDENTE',
          source: 'NFE',
        },
      });
      receivableIds.push(r.id);
    }

    await tx.importedDocument.create({
      data: {
        source: 'NFE',
        externalId: nfe.chaveAcesso,
        filePath,
        status: 'IMPORTADO',
        createdIds: JSON.stringify({ clientId: client.id, saleIds, receivableIds }),
      },
    });
  });
}

export async function importNfeFromDirectory(dirPath: string): Promise<NfeImportResult[]> {
  const files = await listXmlFiles(dirPath);
  const results: NfeImportResult[] = [];

  for (const filePath of files) {
    // externalId de fallback para registrar erro quando nem a chave de acesso
    // pôde ser extraída (XML corrompido) — usa o caminho do arquivo nesse caso.
    let externalIdParaErro = filePath;
    try {
      const nfe = await parseNfeFile(filePath);
      if (nfe === null) {
        results.push({ arquivo: filePath, status: 'IGNORADO_NAO_NFE' });
        continue;
      }
      externalIdParaErro = nfe.chaveAcesso;

      const already = await prisma.importedDocument.findUnique({
        where: { source_externalId: { source: 'NFE', externalId: nfe.chaveAcesso } },
      });
      if (already) {
        results.push({ arquivo: filePath, status: already.status === 'ERRO' ? 'ERRO' : 'JA_IMPORTADO', detalhe: already.errorMessage ?? undefined });
        continue;
      }

      await importOneNfe(nfe, filePath);
      results.push({ arquivo: filePath, status: 'IMPORTADO' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Registra o erro fora da transação que falhou, para não reprocessar o
      // mesmo XML corrompido a cada execução — mas a falha fica visível/auditável.
      await prisma.importedDocument.upsert({
        where: { source_externalId: { source: 'NFE', externalId: externalIdParaErro } },
        update: { status: 'ERRO', errorMessage: message, filePath },
        create: { source: 'NFE', externalId: externalIdParaErro, filePath, status: 'ERRO', errorMessage: message },
      });
      results.push({ arquivo: filePath, status: 'ERRO', detalhe: message });
    }
  }

  return results;
}
