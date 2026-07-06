// ============================================================
// Parser puro de XML de NF-e (nfeProc) — não toca no banco.
//
// A pasta de origem (baixada pelo robô SIEG, projeto separado) mistura
// dois formatos de XML: a nota fiscal em si (`nfeProc`) e eventos da nota
// (`procEventoNFe`, ex.: "Ciência da Operação"). Só o primeiro nos interessa;
// o segundo faz `parseNfeFile` devolver `null` e o caller (nfeImport.ts)
// simplesmente pula o arquivo.
// ============================================================

import { readFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';

export interface ParsedNfeItem {
  cProd: string;
  xProd: string;
  qCom: number;
  vProd: number;
  vUnCom: number;
}

export interface ParsedNfeDuplicata {
  nDup: string;
  dVenc: Date;
  vDup: number;
}

export interface ParsedNfe {
  chaveAcesso: string; // protNFe.infProt.chNFe — 44 dígitos
  numeroNota: string; // ide.nNF
  dhEmi: Date;
  natOp: string;
  destCnpj: string | null; // CNPJ ou CPF do destinatário
  destNome: string;
  itens: ParsedNfeItem[];
  valorTotal: number; // total.ICMSTot.vNF
  duplicatas: ParsedNfeDuplicata[]; // [] quando é à vista
  pagamentoAvista: { tPag: string; vPag: number } | null; // só quando duplicatas.length === 0
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false, // mantém tudo string; convertemos manualmente (evita floats quebrados em valores monetários)
});

/** Normaliza um campo que o fast-xml-parser entrega como objeto único (1 ocorrência) ou array (2+). */
function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Converte para número exigindo que o resultado seja finito — uma tag SEFAZ
 * ausente/malformada (ex.: <vProd></vProd>) vira NaN silenciosamente com
 * Number(), o que gravaria valores monetários corrompidos no banco sem
 * nenhum erro visível. Lança em vez de deixar propagar.
 */
function requireFiniteNumber(raw: unknown, field: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Campo numérico inválido no XML da NF-e: ${field}="${raw}"`);
  return n;
}

/**
 * Formas de pagamento SEFAZ que indicam quitação imediata na prática de uma
 * revenda (dinheiro, cartão, vale, pix). Demais códigos (15=Sem pagamento,
 * 17=Boleto sem duplicata, 99=Outros) ficam PENDENTE — decisão de negócio.
 */
const TPAG_QUITACAO_IMEDIATA = new Set(['01', '03', '04', '05', '10', '13']);

export function isPagamentoQuitadoNaEmissao(tPag: string): boolean {
  return TPAG_QUITACAO_IMEDIATA.has(tPag);
}

export async function parseNfeFile(filePath: string): Promise<ParsedNfe | null> {
  const xml = await readFile(filePath, 'utf-8');
  const json = parser.parse(xml);

  // Cobre procEventoNFe (evento da nota) e qualquer outro tipo não esperado.
  if (!json.nfeProc) return null;

  const infNFe = json.nfeProc.NFe?.infNFe;
  if (!infNFe) return null;

  const chaveAcesso = json.nfeProc.protNFe?.infProt?.chNFe;
  if (!chaveAcesso) return null; // sem protocolo de autorização — não deveria estar em "Saídas", mas não travar o import

  const ide = infNFe.ide ?? {};
  const dest = infNFe.dest ?? {};

  const itens: ParsedNfeItem[] = asArray(infNFe.det).map((d: any) => ({
    cProd: String(d.prod.cProd),
    xProd: String(d.prod.xProd),
    qCom: requireFiniteNumber(d.prod.qCom, 'det.prod.qCom'),
    vProd: requireFiniteNumber(d.prod.vProd, 'det.prod.vProd'),
    vUnCom: requireFiniteNumber(d.prod.vUnCom, 'det.prod.vUnCom'),
  }));

  const duplicatas: ParsedNfeDuplicata[] = asArray(infNFe.cobr?.dup).map((d: any) => ({
    nDup: String(d.nDup),
    dVenc: new Date(`${d.dVenc}T00:00:00`),
    vDup: requireFiniteNumber(d.vDup, 'cobr.dup.vDup'),
  }));

  // Pagamento à vista: só relevante quando não há duplicatas. Pagamento misto
  // (múltiplos detPag) usa o primeiro — limitação conhecida, documentada no plano.
  let pagamentoAvista: { tPag: string; vPag: number } | null = null;
  if (duplicatas.length === 0) {
    const detPag = asArray(infNFe.pag?.detPag)[0];
    if (detPag) {
      pagamentoAvista = { tPag: String(detPag.tPag), vPag: requireFiniteNumber(detPag.vPag, 'pag.detPag.vPag') };
    }
  }

  return {
    chaveAcesso: String(chaveAcesso),
    numeroNota: String(ide.nNF),
    dhEmi: new Date(ide.dhEmi),
    natOp: String(ide.natOp ?? ''),
    destCnpj: dest.CNPJ ? String(dest.CNPJ) : dest.CPF ? String(dest.CPF) : null,
    destNome: String(dest.xNome ?? 'Cliente sem nome'),
    itens,
    valorTotal: requireFiniteNumber(infNFe.total?.ICMSTot?.vNF ?? 0, 'total.ICMSTot.vNF'),
    duplicatas,
    pagamentoAvista,
  };
}
