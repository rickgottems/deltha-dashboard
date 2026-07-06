// Cores usadas dentro dos gráficos (Recharts precisa de valores concretos,
// não consegue ler var(--color-*) do Tailwind). Manter em sincronia byte-a-byte
// com os tokens @theme de src/index.css — paleta oficial da marca Radar Deltha
// (navy + carmim, extraída de Logos/Logo Deltha 1.pdf).

export const C = {
  bg: '#070B1C',
  panel: '#0D1430',
  panel2: '#141D3C',
  line: '#243054',
  ink: '#E8EBF5',
  mut: '#8B93AC',
  accent: '#D81F45', // carmim da marca — série principal, usado com moderação
  pos: '#22C55E', // verde — positivo / dentro da meta (semântico)
  warn: '#F5A524', // amarelo — atenção (semântico)
  neg: '#FF6B6B', // vermelho — negativo / crítico (semântico, clareado p/ não colidir com o carmim da marca)
  blue: '#5B8DEF', // série de dados neutra
  silver: '#C3CAD9', // série de dados neutra clara
} as const;

export type AlertLevel = 'critico' | 'atencao' | 'confortavel';

export const LEVEL_COLOR: Record<AlertLevel, string> = {
  critico: C.neg,
  atencao: C.warn,
  confortavel: C.pos,
};

export const LEVEL_LABEL: Record<AlertLevel, string> = {
  critico: 'CRÍTICO',
  atencao: 'ATENÇÃO',
  confortavel: 'CONFORTÁVEL',
};

export const RISK_COLOR: Record<string, string> = {
  BAIXO: C.pos,
  MEDIO: C.warn,
  ALTO: C.neg,
  SEM_HISTORICO: C.mut,
};

export const RISK_LABEL: Record<string, string> = {
  BAIXO: 'Baixo',
  MEDIO: 'Médio',
  ALTO: 'Alto',
  SEM_HISTORICO: 'Sem histórico',
};
