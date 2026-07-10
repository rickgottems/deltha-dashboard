// ============================================================
// Score de Saúde Financeira — HEURÍSTICA v1 determinística sobre Balanço
// Patrimonial + DFC, mesma política de services/risk.ts: propositalmente
// NÃO é machine learning/IA preditiva (nem se chama assim no código) —
// são thresholds fixos e documentados, revisáveis a qualquer momento.
//
// Só calcula os índices que dependem de Balanço/DFC quando a empresa já
// lançou esses dados para o período (Configurações → Balanço/DFC); sem
// isso, o índice fica `null` e a regra correspondente simplesmente não
// avalia — nunca inventa valor (mesma convenção do resto do app).
//
// Adaptação de periodicidade: o app inteiro trabalha em cadência mensal
// (MonthPicker em toda tela) — FCO e CAPEX do CashFlowStatement são
// tratados como valores DO MÊS do período, não anualizados.
// ============================================================

import type { MonthFinance } from './finance.js';
import type { AlertLevel } from './alerts.js';

export interface BalanceSheetInput {
  currentAssets: number;
  inventory: number;
  nonCurrentAssets: number;
  currentLiabilities: number;
  shortTermDebt: number;
  longTermDebt: number;
  cashAndEquivalents: number;
  equity: number;
}

export interface CashFlowInput {
  operatingCashFlow: number;
  capex: number;
}

export interface ExtendedMetrics {
  margemEbit: number | null; // só precisa da DRE (MonthFinance) — sempre calculável
  coberturaJuros: number | null; // idem
  liquidezSeca: number | null; // precisa de Balanço
  alavancagemDividaEbitda: number | null; // precisa de Balanço
  giroAtivos: number | null; // precisa de Balanço
  runwayMeses: number | null; // precisa de Balanço + DFC
  fcoVsLucro: number | null; // precisa de DFC (FCO real, não o proxy usado em dreAlerts.ts)
}

export interface HealthAlert {
  metricKey: string;
  label: string;
  level: AlertLevel;
  value: number;
  message: string;
}

export interface HealthScoreResult {
  score: number;
  metrics: ExtendedMetrics;
  alerts: HealthAlert[];
  hasBalanceSheet: boolean;
  hasCashFlow: boolean;
}

const ASSET_EQUATION_TOLERANCE = 0.01;

/**
 * Valida a equação contábil fundamental (Ativo = Passivo + PL) e que
 * Estoques não excedam o Ativo Circulante. Lança erro descritivo se o
 * balanço não fechar — usado em routes/config.ts ao salvar.
 * Nota: `shortTermDebt` é um SUBCONJUNTO de `currentLiabilities` (dívida de
 * curto prazo já está dentro do passivo circulante), por isso não entra
 * de novo na soma do passivo total — só é usado separadamente para compor
 * a dívida total na Alavancagem.
 */
export function validateBalanceSheet(bs: BalanceSheetInput): string | null {
  const ativoTotal = bs.currentAssets + bs.nonCurrentAssets;
  const passivoTotal = bs.currentLiabilities + bs.longTermDebt;
  const equacao = passivoTotal + bs.equity;
  if (Math.abs(ativoTotal - equacao) > ASSET_EQUATION_TOLERANCE) {
    return `Balanço não fecha: Ativo Total (${ativoTotal.toFixed(2)}) deveria ser igual a Passivo + Patrimônio Líquido (${equacao.toFixed(2)}).`;
  }
  if (bs.inventory > bs.currentAssets) {
    return 'Estoques não pode ser maior que o Ativo Circulante.';
  }
  return null;
}

export function computeExtendedMetrics(
  mf: MonthFinance,
  bs: BalanceSheetInput | null,
  cf: CashFlowInput | null
): ExtendedMetrics {
  const margemEbit = mf.receitaLiquida > 0 ? (mf.ebit / mf.receitaLiquida) * 100 : null;
  const coberturaJuros = mf.financeiras > 0 ? mf.ebit / mf.financeiras : null;

  let liquidezSeca: number | null = null;
  let alavancagemDividaEbitda: number | null = null;
  let giroAtivos: number | null = null;
  if (bs) {
    liquidezSeca = bs.currentLiabilities > 0 ? (bs.currentAssets - bs.inventory) / bs.currentLiabilities : null;
    const ativoTotal = bs.currentAssets + bs.nonCurrentAssets;
    giroAtivos = ativoTotal > 0 ? mf.receitaLiquida / ativoTotal : null;
    if (mf.ebitda > 0) {
      const dividaLiquida = bs.shortTermDebt + bs.longTermDebt - bs.cashAndEquivalents;
      alavancagemDividaEbitda = dividaLiquida / mf.ebitda;
    }
  }

  let runwayMeses: number | null = null;
  if (bs && cf) {
    const fluxoLivre = cf.operatingCashFlow - cf.capex;
    if (fluxoLivre < 0) {
      const queimaMensal = Math.abs(fluxoLivre);
      runwayMeses = queimaMensal > 0 ? bs.cashAndEquivalents / queimaMensal : null;
    } else {
      runwayMeses = Infinity; // gera caixa: sem prazo de esgotamento
    }
  }

  const fcoVsLucro = cf && mf.lucroLiquido !== 0 ? cf.operatingCashFlow / mf.lucroLiquido : null;

  return { margemEbit, coberturaJuros, liquidezSeca, alavancagemDividaEbitda, giroAtivos, runwayMeses, fcoVsLucro };
}

const THRESHOLDS = {
  alavancagemMax: 3.5,
  coberturaJurosMin: 1.5,
  liquidezSecaMin: 1.0,
  runwayMesesMin: 8.0,
};

function evaluateAlerts(mf: MonthFinance, cf: CashFlowInput | null, m: ExtendedMetrics): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  if (
    m.alavancagemDividaEbitda !== null &&
    m.coberturaJuros !== null &&
    m.alavancagemDividaEbitda > THRESHOLDS.alavancagemMax &&
    m.coberturaJuros < THRESHOLDS.coberturaJurosMin
  ) {
    alerts.push({
      metricKey: 'hs_insolvencia',
      label: 'Risco de Insolvência',
      level: 'critico',
      value: m.alavancagemDividaEbitda,
      message: `Alavancagem (dívida líquida ÷ EBITDA) em ${m.alavancagemDividaEbitda.toFixed(2)}x — acima de ${THRESHOLDS.alavancagemMax}x — combinada com cobertura de juros de ${m.coberturaJuros.toFixed(2)}x — abaixo de ${THRESHOLDS.coberturaJurosMin}x: combinação de alto risco de quebra.`,
    });
  }

  if (cf && mf.lucroLiquido > 0 && cf.operatingCashFlow < 0) {
    alerts.push({
      metricKey: 'hs_divergencia_caixa',
      label: 'Lucro sem Geração de Caixa',
      level: 'critico',
      value: cf.operatingCashFlow,
      message:
        'A empresa reporta lucro líquido positivo, mas o Fluxo de Caixa Operacional do DFC é negativo — sinal de lucro contábil não sustentado por geração de caixa real.',
    });
  }

  if (m.liquidezSeca !== null && m.liquidezSeca < THRESHOLDS.liquidezSecaMin) {
    alerts.push({
      metricKey: 'hs_liquidez_comprometida',
      label: 'Liquidez Comprometida',
      level: 'atencao',
      value: m.liquidezSeca,
      message: `Liquidez Seca em ${m.liquidezSeca.toFixed(2)} — abaixo de ${THRESHOLDS.liquidezSecaMin}: a empresa dependeria de vender estoque para cobrir as obrigações de curto prazo.`,
    });
  }

  if (m.runwayMeses !== null && Number.isFinite(m.runwayMeses) && m.runwayMeses < THRESHOLDS.runwayMesesMin) {
    alerts.push({
      metricKey: 'hs_sobrevivencia',
      label: 'Runway Curto',
      level: 'critico',
      value: m.runwayMeses,
      message: `Caixa disponível cobre só ${m.runwayMeses.toFixed(1)} meses de queima no ritmo atual — abaixo do mínimo saudável de ${THRESHOLDS.runwayMesesMin} meses.`,
    });
  }

  const order: Record<AlertLevel, number> = { critico: 0, atencao: 1, confortavel: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

function calculateScore(mf: MonthFinance, metrics: ExtendedMetrics, alerts: HealthAlert[]): number {
  let score = 100;
  const penalties: Record<AlertLevel, number> = { critico: 25, atencao: 10, confortavel: 0 };
  for (const a of alerts) score -= penalties[a.level];
  if (mf.margemEbitda !== null && mf.margemEbitda > 20) score += 10;
  if (metrics.liquidezSeca !== null && metrics.liquidezSeca > 1.5) score += 5;
  return Math.max(0, Math.min(100, score));
}

export function evaluateHealthScore(
  mf: MonthFinance,
  bs: BalanceSheetInput | null,
  cf: CashFlowInput | null
): HealthScoreResult {
  const metrics = computeExtendedMetrics(mf, bs, cf);
  const alerts = evaluateAlerts(mf, cf, metrics);
  const score = calculateScore(mf, metrics, alerts);
  return { score, metrics, alerts, hasBalanceSheet: bs !== null, hasCashFlow: cf !== null };
}
