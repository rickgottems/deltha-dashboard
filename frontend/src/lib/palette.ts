// Cores usadas dentro dos gráficos (Recharts precisa de valores concretos,
// não consegue ler var(--color-*) do Tailwind em runtime). Em vez de manter
// um segundo espelho hardcoded em sincronia manual com os tokens @theme de
// src/index.css, lemos os valores computados do próprio CSS — index.css
// continua a ÚNICA fonte da verdade da paleta; aqui só espelhamos o mesmo
// dado para o mundo não-DOM do Recharts. Os hex abaixo são só fallback (uso
// fora do navegador, ex. testes sem jsdom com CSS carregado).

const FALLBACK = {
  bg: '#070B1C',
  panel: '#0D1430',
  panel2: '#141D3C',
  line: '#243054',
  ink: '#E8EBF5',
  mut: '#8B93AC',
  accent: '#D81F45',
  pos: '#22C55E',
  warn: '#F5A524',
  neg: '#FF6B6B',
  blue: '#5B8DEF',
  silver: '#C3CAD9',
} as const;

type PaletteKey = keyof typeof FALLBACK;

function readThemeColors(): Record<PaletteKey, string> {
  if (typeof document === 'undefined') return { ...FALLBACK };
  const styles = getComputedStyle(document.documentElement);
  const result = {} as Record<PaletteKey, string>;
  for (const key of Object.keys(FALLBACK) as PaletteKey[]) {
    const value = styles.getPropertyValue(`--color-${key}`).trim();
    result[key] = value || FALLBACK[key];
  }
  return result;
}

// index.css/@theme não muda em runtime (sem alternância de tema hoje) —
// lido uma vez no load do módulo, não a cada render.
export const C = readThemeColors();

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
