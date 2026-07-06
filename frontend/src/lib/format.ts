export const fmtBRL = (v: number, digits = 0): string =>
  v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** R$ 1,2M / R$ 340K — para KPIs grandes */
export const fmtBRLCompact = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v < 0 ? '-' : ''}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}M`;
  if (abs >= 100_000) return `${v < 0 ? '-' : ''}R$ ${(abs / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}K`;
  return fmtBRL(v);
};

export const fmtPct = (v: number, digits = 1): string =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

export const fmtNum = (v: number, digits = 0): string =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: digits });

/** "2026-07-05" → "05/07/2026" */
export const fmtDateISO = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** "2026-07" → "julho de 2026" */
export const fmtYm = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_PT[m - 1]} de ${y}`;
};

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

export const currentYm = (): string => todayISO().slice(0, 7);

export const addMonths = (ym: string, delta: number): string => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
