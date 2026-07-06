import { Router } from 'express';
import { ah } from '../lib/http.js';
import { currentYm, isValidYm } from '../lib/period.js';
import { financeSeries, pctChange } from '../services/finance.js';
import { evaluateAlerts } from '../services/alerts.js';

export const financeiroRouter = Router();

/** GET /api/financeiro?month=YYYY-MM — KPIs, séries e alertas financeiros. */
financeiroRouter.get(
  '/',
  ah(async (req, res) => {
    const ym = isValidYm(String(req.query.month ?? '')) ? String(req.query.month) : currentYm();
    const [series12, alerts] = await Promise.all([financeSeries(12, ym), evaluateAlerts(ym, 'financeiro')]);
    const atual = series12[series12.length - 1];
    const anterior = series12[series12.length - 2];

    res.json({
      month: ym,
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
      },
      receitaXdespesa: series12.map((f) => ({ label: f.label, receita: f.receitaBruta, despesa: f.despesasTotais })),
      lucroSerie: series12.map((f) => ({ label: f.label, lucro: f.lucroLiquido })),
      fluxoCaixa: series12.map((f) => ({ label: f.label, valor: f.fluxoCaixa })),
      alerts,
      hasData: series12.some((f) => f.receitaBruta > 0 || f.despesasTotais > 0),
    });
  })
);
