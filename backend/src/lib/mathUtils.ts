// Aritmética segura para valores financeiros. JavaScript tem imprecisão de
// ponto flutuante nativa (0.1 + 0.2 !== 0.3) — arredondar em 2 casas nos
// valores finais evita ruído tipo "24.999999999999996" chegando na UI ou em
// comparações de regra (ex.: liquidezSeca < 1.0 falhando por 0.9999999998).
// Usado em services/finance.ts, healthScore.ts e dreAlerts.ts.

/** Arredonda para 2 casas decimais sem o erro clássico de Math.round em ponto flutuante. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Divisão seguida de arredondamento em 2 casas. Retorna `null` (não 0)
 * quando o denominador é zero — no domínio financeiro deste app, "sem
 * base para calcular a razão" é semanticamente diferente de "razão zero"
 * (ex.: Margem EBITDA com Receita=0 não é "0% de margem", é "indefinida").
 * A UI já trata `null` como "—"/"sem dado" em todo o app.
 */
export function safeDivide(numerador: number, denominador: number): number | null {
  if (!denominador) return null;
  return round2(numerador / denominador);
}
