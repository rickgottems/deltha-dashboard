// ============================================================
// Serviço financeiro — todas as agregações vêm do banco (Prisma).
//
// DRE gerencial simplificada (v1), documentada e consistente em todo o app:
//   Receita Bruta       = Σ receivables (dueDate no período, status ≠ CANCELADA) [competência]
//   Deduções            = Σ expenses kind = DEDUCAO
//   Receita Líquida     = Receita Bruta − Deduções
//   Custos              = Σ expenses kind = CUSTO
//   Despesas Operac.    = Σ expenses kind ∈ {OPERACIONAL, DEPRECIACAO}
//   Outras Rec/Desp     = Σ expenses kind ∈ {OUTRA, FINANCEIRA}
//   Lucro Operacional   = Receita Líquida − Custos − Despesas Operac. − Outras
//   Lucro Líquido (v1)  = Lucro Operacional (IR/CSLL fora do escopo v1)
//   EBITDA              = Lucro Operacional + DEPRECIACAO + FINANCEIRA (add-back)
//   Margem EBITDA       = EBITDA ÷ Receita Líquida
//   Margem Líquida      = Lucro Líquido ÷ Receita Líquida
//   Fluxo de Caixa      = Σ receivables PAGAS (paidDate no mês) − Σ expenses (regime caixa)
// ============================================================

import { prisma } from '../db.js';
import { GOAL_DEFAULT_PERIOD } from '../lib/constants.js';
import { lastMonths, monthRange, prevYm, spanLabel, spanRange, ymLabel, type Range } from '../lib/period.js';

export interface MonthFinance {
  ym: string;
  label: string;
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  custos: number;
  despesasOperacionais: number;
  outras: number;
  depreciacao: number;
  financeiras: number;
  despesasTotais: number;
  lucroOperacional: number;
  lucroLiquido: number;
  ebitda: number;
  margemEbitda: number | null;
  margemLiquida: number | null;
  fluxoCaixa: number;
  recebimentos: number;
}

/**
 * Opções de recorte por Cliente. IMPORTANTE: `Expense` não tem `clientId`
 * no schema (despesas não são atribuíveis a um cliente específico) — então
 * um filtro de cliente só consegue recortar a RECEITA (receitaBruta,
 * recebimentos, receitaLiquida). Custos/Despesas/EBITDA/Lucro continuam
 * sendo os da empresa inteira. `FinancePeriod.clientFiltered` sinaliza isso
 * para a UI exibir o aviso correspondente.
 */
export interface FinanceFilterOpts {
  clientId?: string;
}

async function sumReceivablesDue(r: Range, opts: FinanceFilterOpts = {}): Promise<number> {
  const agg = await prisma.receivable.aggregate({
    _sum: { amount: true },
    where: {
      dueDate: { gte: r.start, lt: r.end },
      status: { not: 'CANCELADA' },
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
    },
  });
  return agg._sum.amount ?? 0;
}

async function sumReceivablesPaid(r: Range, opts: FinanceFilterOpts = {}): Promise<number> {
  const agg = await prisma.receivable.aggregate({
    _sum: { amount: true },
    where: {
      paidDate: { gte: r.start, lt: r.end },
      status: 'PAGA',
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
    },
  });
  return agg._sum.amount ?? 0;
}

async function expensesByKind(r: Range): Promise<Record<string, number>> {
  const rows = await prisma.expense.groupBy({
    by: ['kind'],
    _sum: { amount: true },
    where: { date: { gte: r.start, lt: r.end } },
  });
  const out: Record<string, number> = {};
  for (const row of rows) out[row.kind] = row._sum.amount ?? 0;
  return out;
}

export interface FinancePeriod extends MonthFinance {
  fromYm: string;
  toYm: string;
  clientFiltered: boolean;
}

/** Núcleo do cálculo: agrega um Range arbitrário (1 mês ou vários), com filtro opcional de cliente. */
export async function periodFinance(fromYm: string, toYm: string, opts: FinanceFilterOpts = {}): Promise<FinancePeriod> {
  const r = spanRange(fromYm, toYm);
  const [receitaBruta, kinds, recebimentos] = await Promise.all([
    sumReceivablesDue(r, opts),
    expensesByKind(r),
    sumReceivablesPaid(r, opts),
  ]);

  const deducoes = kinds['DEDUCAO'] ?? 0;
  const custos = kinds['CUSTO'] ?? 0;
  const depreciacao = kinds['DEPRECIACAO'] ?? 0;
  const financeiras = kinds['FINANCEIRA'] ?? 0;
  const operacional = (kinds['OPERACIONAL'] ?? 0) + depreciacao;
  const outras = (kinds['OUTRA'] ?? 0) + financeiras;
  const receitaLiquida = receitaBruta - deducoes;
  const lucroOperacional = receitaLiquida - custos - operacional - outras;
  const lucroLiquido = lucroOperacional;
  const ebitda = lucroOperacional + depreciacao + financeiras;
  const despesasTotais = Object.values(kinds).reduce((a, b) => a + b, 0);

  return {
    ym: fromYm === toYm ? fromYm : `${fromYm}_${toYm}`,
    label: spanLabel(fromYm, toYm),
    fromYm,
    toYm,
    clientFiltered: Boolean(opts.clientId),
    receitaBruta,
    deducoes,
    receitaLiquida,
    custos,
    despesasOperacionais: operacional,
    outras,
    depreciacao,
    financeiras,
    despesasTotais,
    lucroOperacional,
    lucroLiquido,
    ebitda,
    margemEbitda: receitaLiquida > 0 ? (ebitda / receitaLiquida) * 100 : null,
    margemLiquida: receitaLiquida > 0 ? (lucroLiquido / receitaLiquida) * 100 : null,
    fluxoCaixa: recebimentos - despesasTotais,
    recebimentos,
  };
}

export async function monthFinance(ym: string): Promise<MonthFinance> {
  return periodFinance(ym, ym);
}

export async function financeSeries(n: number, refYm: string, opts: FinanceFilterOpts = {}): Promise<MonthFinance[]> {
  return Promise.all(lastMonths(n, refYm).map((ym) => periodFinance(ym, ym, opts)));
}

/** Variação percentual (null quando base é 0 — evita divisões absurdas). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export async function monthWithPrev(ym: string): Promise<{ atual: MonthFinance; anterior: MonthFinance }> {
  const [atual, anterior] = await Promise.all([monthFinance(ym), monthFinance(prevYm(ym))]);
  return { atual, anterior };
}

/**
 * Margem de contribuição média por produto (aba Configurações → Produtos):
 *   (Preço Venda − Preço Custo) / Preço Venda, média simples entre produtos ativos.
 */
export async function contributionMarginAvg(): Promise<{ avg: number | null; count: number }> {
  const products = await prisma.product.findMany({ where: { active: true, salePrice: { gt: 0 } } });
  if (products.length === 0) return { avg: null, count: 0 };
  const sum = products.reduce((acc, p) => acc + (p.salePrice - p.costPrice) / p.salePrice, 0);
  return { avg: (sum / products.length) * 100, count: products.length };
}

export async function newClientsIn(ym: string): Promise<number> {
  const r = monthRange(ym);
  return prisma.client.count({ where: { createdAt: { gte: r.start, lt: r.end } } });
}

export async function newClientsInRange(fromYm: string, toYm: string): Promise<number> {
  const r = spanRange(fromYm, toYm);
  return prisma.client.count({ where: { createdAt: { gte: r.start, lt: r.end } } });
}

export async function salesSummary(ym: string): Promise<{ total: number; count: number; ticket: number | null }> {
  const r = monthRange(ym);
  const agg = await prisma.sale.aggregate({
    _sum: { amount: true },
    _count: { id: true },
    where: { date: { gte: r.start, lt: r.end } },
  });
  const total = agg._sum.amount ?? 0;
  const count = agg._count.id;
  return { total, count, ticket: count > 0 ? total / count : null };
}

/**
 * Inadimplência (12 meses móveis): valor vencido e não pago ÷ valor total
 * com vencimento no período (excluindo canceladas), em %.
 */
export async function inadimplencia(refDate = new Date()): Promise<number | null> {
  const start = new Date(Date.UTC(refDate.getUTCFullYear() - 1, refDate.getUTCMonth(), 1));
  const [totalAgg, overdueAgg] = await Promise.all([
    prisma.receivable.aggregate({
      _sum: { amount: true },
      where: { dueDate: { gte: start, lt: refDate }, status: { not: 'CANCELADA' } },
    }),
    prisma.receivable.aggregate({
      _sum: { amount: true },
      where: {
        dueDate: { gte: start, lt: refDate },
        status: { notIn: ['PAGA', 'CANCELADA'] },
      },
    }),
  ]);
  const total = totalAgg._sum.amount ?? 0;
  if (total === 0) return null;
  return ((overdueAgg._sum.amount ?? 0) / total) * 100;
}

/** Meta configurada: específica do mês ("2026-07") ou padrão ("default"). */
export async function goalFor(metricKey: string, ym: string): Promise<number | null> {
  const rows = await prisma.goal.findMany({
    where: { metricKey, period: { in: [ym, GOAL_DEFAULT_PERIOD] } },
  });
  const specific = rows.find((g) => g.period === ym);
  const def = rows.find((g) => g.period === GOAL_DEFAULT_PERIOD);
  return specific?.value ?? def?.value ?? null;
}

export interface WaterfallStep {
  name: string;
  value: number; // efeito no resultado (deduções/custos negativos)
  kind: 'total' | 'increase' | 'decrease';
}

/** Waterfall "Resultado do período" (Executivo) a partir de um MonthFinance já calculado. */
export function waterfallFromFinance(f: MonthFinance): WaterfallStep[] {
  return [
    { name: 'Receita Bruta', value: f.receitaBruta, kind: 'total' },
    { name: 'Deduções', value: -f.deducoes, kind: 'decrease' },
    { name: 'Receita Líquida', value: f.receitaLiquida, kind: 'total' },
    { name: 'Custos', value: -f.custos, kind: 'decrease' },
    { name: 'Desp. Operacionais', value: -f.despesasOperacionais, kind: 'decrease' },
    { name: 'Outras Rec/Desp', value: -f.outras, kind: 'decrease' },
    { name: 'Lucro Operacional', value: f.lucroOperacional, kind: 'total' },
  ];
}

/** Waterfall "Resultado do período" (Executivo). */
export async function waterfall(ym: string): Promise<WaterfallStep[]> {
  return waterfallFromFinance(await monthFinance(ym));
}

/**
 * Categoria de despesa fora do padrão no mês: gasto > 2× a média dos 6 meses
 * anteriores (com pelo menos 2 meses de histórico). Usado nos Insights.
 */
export async function expenseAnomaly(
  ym: string
): Promise<{ category: string; value: number; avg: number } | null> {
  const r = monthRange(ym);
  const histStart = monthRange(lastMonths(7, ym)[0]).start;
  const [current, history] = await Promise.all([
    prisma.expense.groupBy({
      by: ['category'],
      _sum: { amount: true },
      where: { date: { gte: r.start, lt: r.end } },
    }),
    prisma.expense.groupBy({
      by: ['category'],
      _count: { id: true },
      _sum: { amount: true },
      where: { date: { gte: histStart, lt: r.start } },
    }),
  ]);
  let worst: { category: string; value: number; avg: number; ratio: number } | null = null;
  for (const c of current) {
    const h = history.find((x) => x.category === c.category);
    if (!h || h._count.id < 2) continue;
    const avg = (h._sum.amount ?? 0) / 6;
    const value = c._sum.amount ?? 0;
    if (avg > 0 && value > 2 * avg) {
      const ratio = value / avg;
      if (!worst || ratio > worst.ratio) worst = { category: c.category, value, avg, ratio };
    }
  }
  return worst ? { category: worst.category, value: worst.value, avg: worst.avg } : null;
}
