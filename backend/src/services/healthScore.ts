// ============================================================
// Score de Saúde Financeira — HEURÍSTICA v1 determinística sobre Balanço
// Patrimonial + DFC, mesma política de services/risk.ts: propositalmente
// NÃO é machine learning/IA preditiva (nem se chama assim no código) —
// thresholds vêm de alert_thresholds (por empresa, editável em
// Configurações → Alertas — ZERO valor hardcoded aqui, ver
// deltha-motor-regras-financeiras na memória do projeto).
//
// Duas camadas, seguindo o mesmo vocabulário do documento de referência:
//   REGRAS ATÔMICAS  — 1 métrica × 1 limiar (B7, B8/liquidez seca, F2...)
//   REGRAS COMPOSTAS — cruzam flags atômicas (das próprias + de dreAlerts.ts)
//                      pra reduzir falso positivo (C1/C1b, C2). C3 e C4 do
//                      documento de referência JÁ SÃO os alertas
//                      hs_divergencia_caixa/hs_insolvencia abaixo — não duplicar.
//
// Só calcula os índices que dependem de Balanço/DFC quando a empresa já
// lançou esses dados para o período (Configurações → Balanço/DFC); sem
// isso, o índice fica `null` e a regra correspondente não avalia — nunca
// inventa valor.
// ============================================================

import { prisma } from '../db.js';
import type { MonthFinance } from './finance.js';
import { classify, fmt, type AlertLevel } from './alerts.js';

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
  margemEbit: number | null;
  coberturaJuros: number | null;
  liquidezSeca: number | null;
  liquidezCorrente: number | null;
  alavancagemDividaEbitda: number | null;
  giroAtivos: number | null;
  runwayMeses: number | null;
  fcoVsLucro: number | null;
  capexSobreLucro: number | null;
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
  alerts: HealthAlert[]; // atômicas
  compositeAlerts: HealthAlert[]; // C1/C1b/C2 — ver nota no topo do arquivo
  hasBalanceSheet: boolean;
  hasCashFlow: boolean;
}

export interface HealthScoreInput {
  companyId: string;
  atual: MonthFinance;
  anterior: MonthFinance;
  bs: BalanceSheetInput | null;
  bsAnterior: BalanceSheetInput | null;
  cf: CashFlowInput | null;
  /** Até 3 períodos, cronológico ascendente (mais recente por último) — para F4. */
  cfHistory: CashFlowInput[];
  contasReceberAtual: number;
  contasReceberAnterior: number;
  clientesAtivosAtual: number;
  clientesAtivosAnterior: number;
  /** metricKeys disparados em dreAlerts.ts no mesmo período — para a regra composta C2. */
  dreAlertKeys: Set<string>;
}

const ASSET_EQUATION_TOLERANCE = 0.01;

/**
 * Valida a equação contábil fundamental (Ativo = Passivo + PL) e que
 * Estoques não excedam o Ativo Circulante. Lança erro descritivo se o
 * balanço não fechar — usado em routes/balanco.ts ao salvar.
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

function pctChangeLocal(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export function computeExtendedMetrics(
  mf: MonthFinance,
  bs: BalanceSheetInput | null,
  cf: CashFlowInput | null
): ExtendedMetrics {
  const margemEbit = mf.receitaLiquida > 0 ? (mf.ebit / mf.receitaLiquida) * 100 : null;
  const coberturaJuros = mf.financeiras > 0 ? mf.ebit / mf.financeiras : null;
  const capexSobreLucro = cf && mf.lucroLiquido > 0 ? (cf.capex / mf.lucroLiquido) * 100 : null;

  let liquidezSeca: number | null = null;
  let liquidezCorrente: number | null = null;
  let alavancagemDividaEbitda: number | null = null;
  let giroAtivos: number | null = null;
  if (bs) {
    liquidezSeca = bs.currentLiabilities > 0 ? (bs.currentAssets - bs.inventory) / bs.currentLiabilities : null;
    liquidezCorrente = bs.currentLiabilities > 0 ? bs.currentAssets / bs.currentLiabilities : null;
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

  return {
    margemEbit,
    coberturaJuros,
    liquidezSeca,
    liquidezCorrente,
    alavancagemDividaEbitda,
    giroAtivos,
    runwayMeses,
    fcoVsLucro,
    capexSobreLucro,
  };
}

interface ThresholdRow {
  yellow: number;
  red: number;
  direction: string;
}

const HEALTH_METRIC_KEYS = [
  'liquidez_seca',
  'liquidez_corrente',
  'alavancagem_ebitda',
  'cobertura_juros_bp',
  'capex_sobre_lucro',
  'runway_meses',
] as const;

async function loadThresholds(companyId: string): Promise<Map<string, ThresholdRow>> {
  const rows = await prisma.alertThreshold.findMany({
    where: { companyId, metricKey: { in: [...HEALTH_METRIC_KEYS] } },
  });
  const map = new Map<string, ThresholdRow>();
  for (const r of rows) map.set(r.metricKey, { yellow: r.yellowThreshold, red: r.redThreshold, direction: r.direction });
  return map;
}

function evalAtomic(
  thresholds: Map<string, ThresholdRow>,
  key: string,
  label: string,
  value: number | null,
  unit: string
): HealthAlert | null {
  const t = thresholds.get(key);
  if (!t || value === null || !Number.isFinite(value)) return null;
  const level = classify(value, t.yellow, t.red, t.direction);
  if (level === 'confortavel') return null;
  const comparativo = t.direction === 'ABOVE' ? 'acima de' : 'abaixo de';
  const limiar = level === 'critico' ? t.red : t.yellow;
  return {
    metricKey: key,
    label,
    level,
    value,
    message: `${label} em ${fmt(value, unit)} — ${comparativo} ${fmt(limiar, unit)}.`,
  };
}

/** Regras atômicas de Balanço/DFC — B7, B8(liquidez seca), F2, F3, além do combo B3+D7 → Insolvência. */
function evaluateAtomicAlerts(
  mf: MonthFinance,
  cf: CashFlowInput | null,
  m: ExtendedMetrics,
  thresholds: Map<string, ThresholdRow>
): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  const liquidezSeca = evalAtomic(thresholds, 'liquidez_seca', 'Liquidez Seca', m.liquidezSeca, 'x');
  if (liquidezSeca) alerts.push(liquidezSeca);

  const liquidezCorrente = evalAtomic(thresholds, 'liquidez_corrente', 'Liquidez Corrente', m.liquidezCorrente, 'x');
  if (liquidezCorrente) alerts.push(liquidezCorrente);

  const capex = evalAtomic(thresholds, 'capex_sobre_lucro', 'CAPEX ÷ Lucro Líquido', m.capexSobreLucro, '%');
  if (capex) alerts.push(capex);

  const runway = evalAtomic(thresholds, 'runway_meses', 'Runway de Caixa', m.runwayMeses, 'meses');
  if (runway) alerts.push(runway);

  // F3: FCO ≤ 0, isolado (independe do sinal do lucro — diferente de hs_divergencia_caixa,
  // que exige lucro POSITIVO junto). Sem threshold configurável: zero é o corte contábil.
  if (cf && cf.operatingCashFlow <= 0) {
    alerts.push({
      metricKey: 'hs_fco_negativo',
      label: 'Fluxo de Caixa Operacional Negativo',
      level: 'critico',
      value: cf.operatingCashFlow,
      message: `FCO do mês em ${fmt(cf.operatingCashFlow, 'R$')} — a operação está consumindo caixa próprio, não gerando.`,
    });
  }

  // Insolvência (combo B3+D7 do documento de referência): Alavancagem alta E Cobertura de Juros baixa.
  const alavancagem = thresholds.get('alavancagem_ebitda');
  const cobertura = thresholds.get('cobertura_juros_bp');
  if (
    alavancagem &&
    cobertura &&
    m.alavancagemDividaEbitda !== null &&
    m.coberturaJuros !== null &&
    classify(m.alavancagemDividaEbitda, alavancagem.yellow, alavancagem.red, alavancagem.direction) !== 'confortavel' &&
    classify(m.coberturaJuros, cobertura.yellow, cobertura.red, cobertura.direction) !== 'confortavel'
  ) {
    alerts.push({
      metricKey: 'hs_insolvencia',
      label: 'Risco de Insolvência',
      level: 'critico',
      value: m.alavancagemDividaEbitda,
      message: `Alavancagem (${fmt(m.alavancagemDividaEbitda, 'x')}) e Cobertura de Juros (${fmt(m.coberturaJuros, 'x')}) ambas fora do limite — combinação de alto risco de quebra.`,
    });
  }

  // Divergência de caixa (combo D3+F3 do documento): lucro positivo mas FCO negativo (dado real, não proxy).
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

  const order: Record<AlertLevel, number> = { critico: 0, atencao: 1, confortavel: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

/**
 * Regras COMPOSTAS — cruzam alertas atômicos (próprios + de dreAlerts.ts)
 * pra dar diagnóstico de 2º grau. Ver vocabulário na memória do projeto.
 */
function evaluateCompositeAlerts(input: HealthScoreInput, m: ExtendedMetrics, atomicKeys: Set<string>): HealthAlert[] {
  const composites: HealthAlert[] = [];
  const { atual, anterior, bs, bsAnterior, dreAlertKeys, clientesAtivosAtual, clientesAtivosAnterior } = input;

  const varReceita = pctChangeLocal(atual.receitaBruta, anterior.receitaBruta);

  // B4: Contas a Receber em aberto crescendo mais rápido que a Receita — sinal de
  // inadimplência subindo ou prazos de recebimento alongando (capital de giro em risco).
  const varReceber = pctChangeLocal(input.contasReceberAtual, input.contasReceberAnterior);
  if (varReceita !== null && varReceita > 0 && varReceber !== null && varReceber > varReceita) {
    composites.push({
      metricKey: 'hs_recebiveis_vs_vendas',
      label: 'Risco de Capital de Giro',
      level: 'atencao',
      value: varReceber - varReceita,
      message: `Contas a Receber em aberto cresceram ${varReceber.toFixed(1)}% contra ${varReceita.toFixed(1)}% da Receita — prazos alongando ou inadimplência subindo.`,
    });
  }

  // C1: giro de ativos caindo mesmo com receita subindo — crescimento não está convertendo em vendas.
  if (varReceita !== null && varReceita > 0 && bs && bsAnterior) {
    const ativoTotalAnterior = bsAnterior.currentAssets + bsAnterior.nonCurrentAssets;
    const giroAnterior = ativoTotalAnterior > 0 ? anterior.receitaLiquida / ativoTotalAnterior : null;
    if (m.giroAtivos !== null && giroAnterior !== null && m.giroAtivos < giroAnterior) {
      composites.push({
        metricKey: 'hs_crescimento_inflado',
        label: 'Crescimento Inflado',
        level: 'atencao',
        value: m.giroAtivos,
        message:
          'Receita cresceu, mas o Giro de Ativos caiu — os investimentos em ativos não estão se convertendo em vendas na mesma velocidade.',
      });
    }
  }

  // C1b: receita sobe mas número de clientes ativos cai — crescimento concentrado (ticket médio/reajuste), não expansão de base.
  if (varReceita !== null && varReceita > 0 && clientesAtivosAtual < clientesAtivosAnterior) {
    composites.push({
      metricKey: 'hs_concentracao_receita',
      label: 'Concentração de Risco Comercial',
      level: 'atencao',
      value: clientesAtivosAtual - clientesAtivosAnterior,
      message: `Receita cresceu, mas o número de clientes ativos caiu (${clientesAtivosAnterior} → ${clientesAtivosAtual}) — o crescimento pode estar mascarando perda de base de clientes.`,
    });
  }

  // C2: EBITDA crítico SEM margem bruta baixa — produto é rentável, o problema está na estrutura administrativa (Opex).
  if (dreAlertKeys.has('dre_margem_ebitda') && !dreAlertKeys.has('dre_margem_bruta')) {
    composites.push({
      metricKey: 'hs_funil_comprometido',
      label: 'Funil Administrativo Comprometido',
      level: 'critico',
      value: 1,
      message:
        'Margem Bruta está saudável, mas a Margem EBITDA está crítica — o produto é rentável, a estrutura administrativa (Opex) é que está consumindo o resultado. Recomenda revisar centros de custo.',
    });
  }

  // F4: Fluxo de Caixa Livre (FCO − CAPEX) caindo por 3 períodos seguidos.
  if (input.cfHistory.length === 3) {
    const fcl = input.cfHistory.map((c) => c.operatingCashFlow - c.capex);
    if (fcl[2] < fcl[1] && fcl[1] < fcl[0]) {
      composites.push({
        metricKey: 'hs_fcl_em_queda',
        label: 'Destruição de Valor (FCL em queda)',
        level: 'atencao',
        value: fcl[2],
        message: 'Fluxo de Caixa Livre (FCO − CAPEX) caindo há 3 meses seguidos — tendência de destruição de valor.',
      });
    }
  }

  const order: Record<AlertLevel, number> = { critico: 0, atencao: 1, confortavel: 2 };
  return composites.sort((a, b) => order[a.level] - order[b.level]);
}

function calculateScore(mf: MonthFinance, atomicAlerts: HealthAlert[], compositeAlerts: HealthAlert[]): number {
  let score = 100;
  const penalties: Record<AlertLevel, number> = { critico: 25, atencao: 10, confortavel: 0 };
  for (const a of [...atomicAlerts, ...compositeAlerts]) score -= penalties[a.level];
  if (mf.margemEbitda !== null && mf.margemEbitda > 20) score += 10;
  return Math.max(0, Math.min(100, score));
}

export async function evaluateHealthScore(input: HealthScoreInput): Promise<HealthScoreResult> {
  const { atual, bs, cf } = input;
  const metrics = computeExtendedMetrics(atual, bs, cf);
  const thresholds = await loadThresholds(input.companyId);
  const alerts = evaluateAtomicAlerts(atual, cf, metrics, thresholds);

  const atomicKeys = new Set(alerts.map((a) => a.metricKey));
  const compositeAlerts = evaluateCompositeAlerts(input, metrics, atomicKeys);

  const score = calculateScore(atual, alerts, compositeAlerts);
  return { score, metrics, alerts, compositeAlerts, hasBalanceSheet: bs !== null, hasCashFlow: cf !== null };
}
