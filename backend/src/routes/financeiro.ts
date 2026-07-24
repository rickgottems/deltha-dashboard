import { Router } from 'express';
import { prisma } from '../db.js';
import { ah } from '../lib/http.js';
import { currentYm, isValidYm, lastMonths, prevPeriod } from '../lib/period.js';
import {
  breakEven,
  clientesAtivosNoMes,
  contasAReceberEmAberto,
  contributionMarginAvg,
  financeSeries,
  inadimplenciaPeriod,
  pctChange,
  periodFinance,
} from '../services/finance.js';
import { evaluateAlerts } from '../services/alerts.js';
import { evaluateDreAlerts } from '../services/dreAlerts.js';
import { evaluateHealthScore, type CashFlowInput } from '../services/healthScore.js';

export const financeiroRouter = Router();

/**
 * GET /api/financeiro?from=YYYY-MM&to=YYYY-MM&clientId=xxx
 * (aceita também ?month=YYYY-MM, forma antiga, equivalente a from=to=month)
 * KPIs, séries e alertas financeiros. clientId recorta apenas a Receita —
 * Expense não tem clientId no schema, então despesas/lucro/margens
 * continuam sendo os da empresa inteira (ver nota em services/finance.ts).
 */
financeiroRouter.get(
  '/',
  ah(async (req, res) => {
    const fromQ = String(req.query.from ?? '');
    const toQ = String(req.query.to ?? '');
    const monthQ = String(req.query.month ?? '');
    const clientId = req.query.clientId ? String(req.query.clientId) : undefined;

    let fromYm: string;
    let toYm: string;
    if (isValidYm(fromQ) && isValidYm(toQ)) {
      fromYm = fromQ <= toQ ? fromQ : toQ;
      toYm = fromQ <= toQ ? toQ : fromQ;
    } else if (isValidYm(monthQ)) {
      fromYm = toYm = monthQ;
    } else {
      fromYm = toYm = currentYm();
    }

    const companyId = req.companyId!;
    const opts = { companyId, ...(clientId ? { clientId } : {}) };
    const prev = prevPeriod(fromYm, toYm);
    const cfHistoryMonths = lastMonths(3, toYm); // [dois_atras, anterior, atual] cronológico

    const [
      atual,
      anterior,
      series12,
      alerts,
      dreAlerts,
      contrib,
      inadAtual,
      inadAnterior,
      balanceSheet,
      balanceSheetAnterior,
      cashFlow,
      cfHistoryRows,
      contasReceberAtual,
      contasReceberAnterior,
      clientesAtivosAtual,
      clientesAtivosAnterior,
      pontoEquilibrio,
    ] = await Promise.all([
      periodFinance(fromYm, toYm, opts),
      periodFinance(prev.fromYm, prev.toYm, opts),
      financeSeries(12, toYm, opts),
      evaluateAlerts(toYm, 'financeiro', companyId),
      evaluateDreAlerts(fromYm, toYm, opts),
      contributionMarginAvg(companyId),
      inadimplenciaPeriod(fromYm, toYm, opts),
      inadimplenciaPeriod(prev.fromYm, prev.toYm, opts),
      prisma.balanceSheet.findUnique({ where: { companyId_period: { companyId, period: toYm } } }),
      prisma.balanceSheet.findUnique({ where: { companyId_period: { companyId, period: prev.toYm } } }),
      prisma.cashFlowStatement.findUnique({ where: { companyId_period: { companyId, period: toYm } } }),
      Promise.all(
        cfHistoryMonths.map((m) => prisma.cashFlowStatement.findUnique({ where: { companyId_period: { companyId, period: m } } }))
      ),
      contasAReceberEmAberto(toYm, companyId),
      contasAReceberEmAberto(prev.toYm, companyId),
      clientesAtivosNoMes(toYm, companyId),
      clientesAtivosNoMes(prev.toYm, companyId),
      breakEven(fromYm, toYm, companyId),
    ]);

    // Só entra no histórico de 3 períodos (regra F4) se TODOS os 3 meses tiverem DFC lançado.
    const cfHistory: CashFlowInput[] = cfHistoryRows.every((r) => r !== null)
      ? (cfHistoryRows as NonNullable<(typeof cfHistoryRows)[number]>[])
      : [];

    // Saúde financeira (Balanço/DFC) sempre ancorada no último mês do período
    // (toYm) — mesmo critério já usado para insights/alertas na Fase 1.
    const saudeFinanceira = await evaluateHealthScore({
      companyId,
      atual,
      anterior,
      bs: balanceSheet,
      bsAnterior: balanceSheetAnterior,
      cf: cashFlow,
      cfHistory,
      contasReceberAtual,
      contasReceberAnterior,
      clientesAtivosAtual,
      clientesAtivosAnterior,
      dreAlertKeys: new Set(dreAlerts.map((a) => a.metricKey)),
    });

    res.json({
      fromYm,
      toYm,
      month: toYm,
      clientFiltered: atual.clientFiltered,
      kpis: {
        receita: { value: atual.receitaBruta, varPct: pctChange(atual.receitaBruta, anterior.receitaBruta) },
        despesas: { value: atual.despesasTotais, varPct: pctChange(atual.despesasTotais, anterior.despesasTotais) },
        lucroLiquido: { value: atual.lucroLiquido, varPct: pctChange(atual.lucroLiquido, anterior.lucroLiquido) },
        margemLiquida: {
          value: atual.margemLiquida,
          varPp:
            atual.margemLiquida !== null && anterior.margemLiquida !== null
              ? atual.margemLiquida - anterior.margemLiquida
              : null,
        },
        margemContribuicao: { value: contrib.avg, produtos: contrib.count },
        inadimplencia: {
          value: inadAtual,
          varPp: inadAtual !== null && inadAnterior !== null ? inadAtual - inadAnterior : null,
        },
        ebitda: {
          value: atual.ebitda,
          varPct: pctChange(atual.ebitda, anterior.ebitda),
          margemEbitda: atual.margemEbitda,
        },
      },
      receitaXdespesa: series12.map((f) => ({ label: f.label, receita: f.receitaBruta, despesa: f.despesasTotais })),
      lucroSerie: series12.map((f) => ({ label: f.label, lucro: f.lucroLiquido })),
      fluxoCaixa: series12.map((f) => ({ label: f.label, valor: f.fluxoCaixa })),
      alerts,
      dreAlerts,
      saudeFinanceira,
      pontoEquilibrio,
      hasData: series12.some((f) => f.receitaBruta > 0 || f.despesasTotais > 0),
    });
  })
);
