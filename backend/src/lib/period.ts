// Helpers de período. Convenção v1: todas as datas são tratadas em UTC
// (entradas ISO "YYYY-MM-DD" viram meia-noite UTC), o que mantém agregações
// mensais estáveis independentemente do fuso da máquina.

export interface Range {
  start: Date;
  end: Date; // exclusivo
}

const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function currentYm(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isValidYm(ym: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

/** "2026-07" → { start: 2026-07-01T00:00Z, end: 2026-08-01T00:00Z } */
export function monthRange(ym: string): Range {
  const [y, m] = ym.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}

export function prevYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Últimos n meses terminando em refYm (inclusive), em ordem cronológica. */
export function lastMonths(n: number, refYm: string): string[] {
  const [y, m] = refYm.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** "2026-07" → "jul/26" */
export function ymLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_LABELS[m - 1]}/${String(y).slice(2)}`;
}

/** Parse de query ?from=YYYY-MM-DD&to=YYYY-MM-DD (to inclusivo → end exclusivo). */
export function rangeFromQuery(from?: string, to?: string): Range {
  const now = new Date();
  const defStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00.000Z`) : defStart;
  const end =
    to && /^\d{4}-\d{2}-\d{2}$/.test(to)
      ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000)
      : defEnd;
  return { start, end };
}

export function ymOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Nº de meses entre fromYm e toYm, inclusive (ex: "2026-05".."2026-07" → 3). */
export function monthsBetween(fromYm: string, toYm: string): number {
  const [fy, fm] = fromYm.split('-').map(Number);
  const [ty, tm] = toYm.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** Range cobrindo do início de fromYm ao fim de toYm (inclusive). */
export function spanRange(fromYm: string, toYm: string): Range {
  return { start: monthRange(fromYm).start, end: monthRange(toYm).end };
}

/** "2026-07" → "jul/26" | "2026-05".."2026-07" → "mai/26 – jul/26" */
export function spanLabel(fromYm: string, toYm: string): string {
  return fromYm === toYm ? ymLabel(fromYm) : `${ymLabel(fromYm)} – ${ymLabel(toYm)}`;
}

/** Período anterior de mesma duração, terminando logo antes de fromYm. */
export function prevPeriod(fromYm: string, toYm: string): { fromYm: string; toYm: string } {
  const n = monthsBetween(fromYm, toYm);
  const newToYm = prevYm(fromYm);
  const newFromYm = lastMonths(n, newToYm)[0];
  return { fromYm: newFromYm, toYm: newToYm };
}
