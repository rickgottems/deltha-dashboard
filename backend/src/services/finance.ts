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
//   EBIT                = Lucro Operacional + FINANCEIRA (add-back só do resultado
//                         financeiro — a depreciação continua deduzida, é despesa
//                         "acima" do EBIT; usado para Cobertura de Juros = EBIT ÷
//                         despesas financeiras em services/healthScore.ts)
//   Margem EBITDA       = EBITDA ÷ Receita Líquida
//   Margem Líquida      = Lucro Líquido ÷ Receita Líquida
//   Fluxo de Caixa      = Σ receivables PAGAS (paidDate no mês) − Σ expenses (regime caixa)
//
// TODA função aqui exige `companyId` (multiempresa) — nunca opcional, para
// que seja impossível esquecer o escopo de tenant numa agregação nova.
// ============================================================

import { prisma } from '../db.js';
import { GOAL_DEFAULT_PERIOD } from '../lib/constants.js';
import { lastMonths, monthRange, prevPeriod, prevYm, spanLabel, spanRange, ymLabel, type Range } from '../lib/period.js';
import { round2, safeDivide } from '../lib/mathUtils.js';

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
  ebit: number;
  margemEbitda: number | null;
  margemLiquida: number | null;
  fluxoCaixa: number;
  recebimentos: number;
}

/**
 * Opções de recorte. `companyId` é sempre obrigatório (isolamento
 * multiempresa). `clientId` é opcional — IMPORTANTE: `Expense` não tem
 * `clientId` no schema (despesas não são atribuíveis a um cliente
 * específico), então um filtro de cliente só consegue recortar a RECEITA
 * (receitaBruta, recebimentos, receitaLiquida). Custos/Despesas/EBITDA/Lucro
 * continuam sendo os da empresa inteira. `FinancePeriod.clientFiltered`
 * sinaliza isso para a UI exibir o aviso correspondente.
 */
export interface FinanceFilterOpts {
  companyId: string;
  clientId?: string;
}

async function sumReceivablesDue(r: Range, opts: FinanceFilterOpts): Promise<number> {
  const agg = await prisma.receivable.aggregate({
    _sum: { amount: true },
    where: {
      companyId: opts.companyId,
      dueDate: { gte: r.start, lt: r.end },
      status: { not: 'CANCELADA' },
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
    },
  });
  return agg._sum.amount ?? 0;
}

async function sumReceivablesPaid(r: Range, opts: FinanceFilterOpts): Promise<number> {
  const agg = await prisma.receivable.aggregate({
    _sum: { amount: true },
    where: {
      companyId: opts.companyId,
      paidDate: { gte: r.start, lt: r.end },
      status: 'PAGA',
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
    },
  });
  return agg._sum.amount ?? 0;
}

async function expensesByKind(r: Range, companyId: string): Promise<Record<string, number>> {
  const rows = await prisma.expense.groupBy({
    by: ['kind'],
    _sum: { amount: true },
    where: { companyId, date: { gte: r.start, lt: r.end } },
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
export async function periodFinance(fromYm: string, toYm: string, opts: FinanceFilterOpts): Promise<FinancePeriod> {
  const r = spanRange(fromYm, toYm);
  const [receitaBruta, kinds, recebimentos] = await Promise.all([
    sumReceivablesDue(r, opts),
    expensesByKind(r, opts.companyId),
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
  const ebit = lucroOperacional + financeiras;
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
    ebit,
    margemEbitda: safeDivide(ebitda * 100, receitaLiquida),
    margemLiquida: safeDivide(lucroLiquido * 100, receitaLiquida),
    fluxoCaixa: recebimentos - despesasTotais,
    recebimentos,
  };
}

export async function monthFinance(ym: string, companyId: string): Promise<MonthFinance> {
  return periodFinance(ym, ym, { companyId });
}

/** Período anterior de mesma duração ao [fromYm, toYm], já calculado. */
export async function prevPeriodFinance(fromYm: string, toYm: string, opts: FinanceFilterOpts): Promise<FinancePeriod> {
  const prev = prevPeriod(fromYm, toYm);
  return periodFinance(prev.fromYm, prev.toYm, opts);
}

export async function financeSeries(n: number, refYm: string, opts: FinanceFilterOpts): Promise<MonthFinance[]> {
  return Promise.all(lastMonths(n, refYm).map((ym) => periodFinance(ym, ym, opts)));
}

/** Variação percentual (null quando base é 0 — evita divisões absurdas). */
export function pctChange(current: number, previous: number): number | null {
  return safeDivide((current - previous) * 100, Math.abs(previous));
}

export async function monthWithPrev(ym: string, companyId: string): Promise<{ atual: MonthFinance; anterior: MonthFinance }> {
  const [atual, anterior] = await Promise.all([monthFinance(ym, companyId), monthFinance(prevYm(ym), companyId)]);
  return { atual, anterior };
}

/**
 * Margem de contribuição média por produto (aba Configurações → Produtos):
 *   (Preço Venda − Preço Custo) / Preço Venda, média simples entre produtos ativos.
 */
export async function contributionMarginAvg(companyId: string): Promise<{ avg: number | null; count: number }> {
  const products = await prisma.product.findMany({ where: { companyId, active: true, salePrice: { gt: 0 } } });
  if (products.length === 0) return { avg: null, count: 0 };
  const sum = products.reduce((acc, p) => acc + (p.salePrice - p.costPrice) / p.salePrice, 0);
  return { avg: round2((sum / products.length) * 100), count: products.length };
}

export async function newClientsIn(ym: string, companyId: string): Promise<number> {
  const r = monthRange(ym);
  return prisma.client.count({ where: { companyId, createdAt: { gte: r.start, lt: r.end } } });
}

export async function newClientsInRange(fromYm: string, toYm: string, companyId: string): Promise<number> {
  const r = spanRange(fromYm, toYm);
  return prisma.client.count({ where: { companyId, createdAt: { gte: r.start, lt: r.end } } });
}

/**
 * Contas a Receber EM ABERTO ao final do período (proxy da linha "Contas a
 * Receber" do Balanço — schema não tem esse saldo como campo próprio):
 * soma de receivables com vencimento até o fim do período e status
 * PENDENTE/ATRASADA (não pagas, não canceladas). Usado na regra B4 de
 * services/healthScore.ts.
 */
export async function contasAReceberEmAberto(ym: string, companyId: string): Promise<number> {
  const r = monthRange(ym);
  const agg = await prisma.receivable.aggregate({
    _sum: { amount: true },
    where: { companyId, dueDate: { lt: r.end }, status: { in: ['PENDENTE', 'ATRASADA'] } },
  });
  return agg._sum.amount ?? 0;
}

/** Clientes com pelo menos 1 venda ou 1 receita no mês (mesmo critério de "clientes ativos" da aba Vendas). */
export async function clientesAtivosNoMes(ym: string, companyId: string): Promise<number> {
  const r = monthRange(ym);
  const [vendas, receitas] = await Promise.all([
    prisma.sale.findMany({ where: { companyId, date: { gte: r.start, lt: r.end }, clientId: { not: null } }, select: { clientId: true } }),
    prisma.receivable.findMany({ where: { companyId, dueDate: { gte: r.start, lt: r.end }, clientId: { not: null } }, select: { clientId: true } }),
  ]);
  const ids = new Set<string>();
  for (const v of vendas) if (v.clientId) ids.add(v.clientId);
  for (const rcv of receitas) if (rcv.clientId) ids.add(rcv.clientId);
  return ids.size;
}

export async function salesSummary(ym: string, companyId: string): Promise<{ total: number; count: number; ticket: number | null }> {
  const r = monthRange(ym);
  const agg = await prisma.sale.aggregate({
    _sum: { amount: true },
    _count: { id: true },
    where: { companyId, date: { gte: r.start, lt: r.end } },
  });
  const total = agg._sum.amount ?? 0;
  const count = agg._count.id;
  return { total, count, ticket: safeDivide(total, count) };
}

/**
 * Inadimplência (12 meses móveis): valor vencido e não pago ÷ valor total
 * com vencimento no período (excluindo canceladas), em %.
 */
export async function inadimplencia(companyId: string, refDate = new Date()): Promise<number | null> {
  const start = new Date(Date.UTC(refDate.getUTCFullYear() - 1, refDate.getUTCMonth(), 1));
  const [totalAgg, overdueAgg] = await Promise.all([
    prisma.receivable.aggregate({
      _sum: { amount: true },
      where: { companyId, dueDate: { gte: start, lt: refDate }, status: { not: 'CANCELADA' } },
    }),
    prisma.receivable.aggregate({
      _sum: { amount: true },
      where: {
        companyId,
        dueDate: { gte: start, lt: refDate },
        status: { notIn: ['PAGA', 'CANCELADA'] },
      },
    }),
  ]);
  const total = totalAgg._sum.amount ?? 0;
  return safeDivide((overdueAgg._sum.amount ?? 0) * 100, total);
}

/**
 * Inadimplência Real DO PERÍODO selecionado (não confundir com `inadimplencia()`
 * acima, que é uma janela fixa de 12 meses móveis usada nos Alertas):
 *   valor vencido e não pago ÷ valor total com vencimento no período (from..to), em %.
 * Reage aos mesmos filtros de Ano/Mês/Cliente do Financeiro (Fase 1).
 */
export async function inadimplenciaPeriod(
  fromYm: string,
  toYm: string,
  opts: FinanceFilterOpts
): Promise<number | null> {
  const r = spanRange(fromYm, toYm);
  const clientWhere = opts.clientId ? { clientId: opts.clientId } : {};
  const [totalAgg, overdueAgg] = await Promise.all([
    prisma.receivable.aggregate({
      _sum: { amount: true },
      where: { companyId: opts.companyId, dueDate: { gte: r.start, lt: r.end }, status: { not: 'CANCELADA' }, ...clientWhere },
    }),
    prisma.receivable.aggregate({
      _sum: { amount: true },
      where: { companyId: opts.companyId, dueDate: { gte: r.start, lt: r.end }, status: { notIn: ['PAGA', 'CANCELADA'] }, ...clientWhere },
    }),
  ]);
  const total = totalAgg._sum.amount ?? 0;
  return safeDivide((overdueAgg._sum.amount ?? 0) * 100, total);
}

/** Meta configurada: específica do mês ("2026-07") ou padrão ("default"). */
export async function goalFor(metricKey: string, ym: string, companyId: string): Promise<number | null> {
  const rows = await prisma.goal.findMany({
    where: { companyId, metricKey, period: { in: [ym, GOAL_DEFAULT_PERIOD] } },
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
export async function waterfall(ym: string, companyId: string): Promise<WaterfallStep[]> {
  return waterfallFromFinance(await monthFinance(ym, companyId));
}

/**
 * Categoria de despesa fora do padrão no mês: gasto > 2× a média dos 6 meses
 * anteriores (com pelo menos 2 meses de histórico). Usado nos Insights.
 */
export async function expenseAnomaly(
  ym: string,
  companyId: string
): Promise<{ category: string; value: number; avg: number } | null> {
  const r = monthRange(ym);
  const histStart = monthRange(lastMonths(7, ym)[0]).start;
  const [current, history] = await Promise.all([
    prisma.expense.groupBy({
      by: ['category'],
      _sum: { amount: true },
      where: { companyId, date: { gte: r.start, lt: r.end } },
    }),
    prisma.expense.groupBy({
      by: ['category'],
      _count: { id: true },
      _sum: { amount: true },
      where: { companyId, date: { gte: histStart, lt: r.start } },
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
