// ============================================================
// Importação genérica de planilha de despesas (exportação manual do sistema
// Domínio — sem API, sem amostra real do formato ainda). Fluxo em 2 etapas:
//   1. readSpreadsheetPreview  — lê cabeçalhos + amostra, para a UI montar o
//      mapeamento de colunas (o usuário escolhe qual coluna é data/valor/etc).
//   2. commitExpenseImport     — recebe o arquivo de novo + o mapeamento
//      escolhido, grava Expense linha a linha (falha em 1 linha não derruba
//      as demais — cada linha é independente, ao contrário do import de NF-e).
//
// Deduplicação: hash SHA-256 de (data + valor + descrição) por linha, salvo
// em ImportedDocument (source='DOMINIO_EXPENSE'). Reenviar o mesmo arquivo
// por engano é seguro — linhas já importadas são silenciosamente puladas.
// ============================================================

import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { prisma } from '../db.js';
import { parseCsv } from '../lib/csv.js';
import { EXPENSE_KINDS } from '../lib/constants.js';
import { HttpError } from '../lib/http.js';

export interface SpreadsheetPreview {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
}

export interface ColumnMapping {
  dateColumn: string;
  descriptionColumn?: string | null;
  categoryColumn?: string | null;
  amountColumn: string;
  kindColumn?: string | null;
  defaultKind: string;
  dateFormat: 'DMY' | 'YMD' | 'MDY';
  decimalSeparator: ',' | '.';
}

export interface ExpenseImportResult {
  totalLinhas: number;
  importadas: number;
  duplicadasIgnoradas: number;
  // Números das linhas tratadas como duplicata (mesmo hash de data+valor+
  // descrição de uma linha já importada antes). Dedup por hash de conteúdo
  // NÃO distingue "reenvio do mesmo arquivo" de "correção legítima que por
  // coincidência bate com uma linha antiga" — expor os números de linha aqui
  // permite ao usuário conferir manualmente se algum descarte foi indevido,
  // já que não há um mecanismo de "forçar sobrescrita" (limitação conhecida).
  linhasDuplicadas: number[];
  erros: { linha: number; motivo: string }[];
}

function isXlsx(filename: string): boolean {
  return filename.toLowerCase().endsWith('.xlsx');
}

async function readRowsFromBuffer(buffer: Buffer, filename: string): Promise<string[][]> {
  if (isXlsx(filename)) {
    const wb = new ExcelJS.Workbook();
    // Cast: conflito de tipagem entre versões de @types/node usadas por exceljs
    // vs multer para o genérico de Buffer (ArrayBuffer vs ArrayBufferLike) —
    // inofensivo em runtime, ambos são Buffer do Node.
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const rows: string[][] = [];
    ws.eachRow((row) => {
      const values = (row.values as unknown[]).slice(1); // exceljs usa índice 1-based, [0] é sempre undefined
      rows.push(values.map((v) => cellToString(v)));
    });
    return rows;
  }
  return parseCsv(buffer.toString('utf-8'));
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'result' in (v as any)) return String((v as any).result ?? '');
  if (typeof v === 'object' && 'text' in (v as any)) return String((v as any).text ?? '');
  return String(v).trim();
}

export async function readSpreadsheetPreview(buffer: Buffer, filename: string): Promise<SpreadsheetPreview> {
  const rows = await readRowsFromBuffer(buffer, filename);
  const [headers, ...dataRows] = rows;
  return {
    headers: headers ?? [],
    sampleRows: dataRows.slice(0, 10),
    totalRows: dataRows.length,
  };
}

/** Trata "R$ 1.234,56", "1,234.56", "1.234,56" conforme o separador decimal escolhido. */
function parseAmount(raw: string, decimalSeparator: ',' | '.'): number {
  let s = raw.replace(/[R$\s]/g, '');
  // Remove o separador de MILHAR (o oposto do decimal escolhido) antes de
  // normalizar o decimal — sem isso, "1,234.56" com decimalSeparator='.'
  // nunca tinha a vírgula de milhar removida e Number() retornava NaN.
  if (decimalSeparator === ',') s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Valor inválido: "${raw}"`);
  return n;
}

/** Converte a data da planilha para ISO (YYYY-MM-DD) conforme o formato escolhido pelo usuário. */
function parseDate(raw: string, format: 'DMY' | 'YMD' | 'MDY'): string {
  const trimmed = raw.trim();
  // já em ISO (comum quando a célula é lida como Date pelo exceljs)
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);

  const parts = trimmed.split(/[\/\-.]/).map((p) => p.trim());
  if (parts.length !== 3) throw new Error(`Data inválida: "${raw}"`);

  let y: string, m: string, d: string;
  if (format === 'YMD') [y, m, d] = parts;
  else if (format === 'MDY') [m, d, y] = parts;
  else [d, m, y] = parts; // DMY

  if (y.length === 2) y = `20${y}`;
  const iso = `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  if (Number.isNaN(new Date(iso).getTime())) throw new Error(`Data inválida: "${raw}"`);
  return iso;
}

function rowHash(dateIso: string, amount: number, description: string): string {
  return createHash('sha256')
    .update(`${dateIso}|${amount.toFixed(2)}|${description.trim().toLowerCase()}`)
    .digest('hex');
}

/**
 * Valida os campos do mapeamento ANTES de processar qualquer linha — sem isso,
 * um dateFormat/decimalSeparator/defaultKind inválido (ex.: vindo de uma
 * chamada direta à API, sem passar pelo <Select> do wizard) degradava
 * silenciosamente em vez de falhar com uma mensagem clara.
 */
function validateMapping(mapping: ColumnMapping): void {
  if (!['DMY', 'YMD', 'MDY'].includes(mapping.dateFormat)) {
    throw new HttpError(400, `Formato de data inválido: "${mapping.dateFormat}"`);
  }
  if (![',', '.'].includes(mapping.decimalSeparator)) {
    throw new HttpError(400, `Separador decimal inválido: "${mapping.decimalSeparator}"`);
  }
  if (!EXPENSE_KINDS.includes(mapping.defaultKind as any)) {
    throw new HttpError(400, `Classificação DRE padrão inválida: "${mapping.defaultKind}"`);
  }
}

export async function commitExpenseImport(
  buffer: Buffer,
  filename: string,
  mapping: ColumnMapping
): Promise<ExpenseImportResult> {
  validateMapping(mapping);
  const rows = await readRowsFromBuffer(buffer, filename);
  const [headers, ...dataRows] = rows;
  if (!headers) return { totalLinhas: 0, importadas: 0, duplicadasIgnoradas: 0, linhasDuplicadas: [], erros: [] };

  const idx = (col: string | null | undefined) => (col ? headers.indexOf(col) : -1);
  const dateIdx = idx(mapping.dateColumn);
  const amountIdx = idx(mapping.amountColumn);
  const descIdx = idx(mapping.descriptionColumn);
  const catIdx = idx(mapping.categoryColumn);
  const kindIdx = idx(mapping.kindColumn);

  const result: ExpenseImportResult = {
    totalLinhas: dataRows.length,
    importadas: 0,
    duplicadasIgnoradas: 0,
    linhasDuplicadas: [],
    erros: [],
  };

  for (let i = 0; i < dataRows.length; i++) {
    const linha = i + 2; // +1 header, +1 para contagem 1-based amigável ao usuário
    const row = dataRows[i];
    try {
      const rawDate = dateIdx >= 0 ? row[dateIdx] : '';
      const rawAmount = amountIdx >= 0 ? row[amountIdx] : '';
      if (!rawDate || !rawAmount) throw new Error('Data ou valor vazio');

      const dateIso = parseDate(rawDate, mapping.dateFormat);
      const amount = parseAmount(rawAmount, mapping.decimalSeparator);
      const description = descIdx >= 0 ? (row[descIdx] ?? '') : '';
      const category = catIdx >= 0 && row[catIdx] ? row[catIdx] : 'Geral';
      const rawKind = (kindIdx >= 0 ? row[kindIdx] : '').trim().toUpperCase();
      const kind = EXPENSE_KINDS.includes(rawKind as any) ? rawKind : mapping.defaultKind;

      const hash = rowHash(dateIso, amount, description);
      const already = await prisma.importedDocument.findUnique({
        where: { source_externalId: { source: 'DOMINIO_EXPENSE', externalId: hash } },
      });
      if (already) {
        result.duplicadasIgnoradas++;
        result.linhasDuplicadas.push(linha);
        continue;
      }

      const expense = await prisma.expense.create({
        data: {
          category,
          kind,
          description: description || null,
          amount,
          date: new Date(`${dateIso}T00:00:00`),
          source: 'DOMINIO',
        },
      });

      await prisma.importedDocument.create({
        data: {
          source: 'DOMINIO_EXPENSE',
          externalId: hash,
          filePath: filename,
          status: 'IMPORTADO',
          createdIds: JSON.stringify({ expenseId: expense.id }),
        },
      });

      result.importadas++;
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      result.erros.push({ linha, motivo });
    }
  }

  return result;
}
