import { Router } from 'express';
import { ah } from '../lib/http.js';
import { currentYm, isValidYm, lastMonths, ymLabel } from '../lib/period.js';
import {
  contributionMarginAvg,
  financeSeries,
  goalFor,
  newClientsIn,
  pctChange,
  waterfall,
} from '../services/finance.js';
import { buildInsights } from '../services/insights.js';
import { evaluateAlerts } from '../services/alerts.js';

export const executivoRouter = Router();

/**
 * GET /api/executivo?month=YYYY-MM
 * Payload completo da tela Executivo: KPIs (com sparkline), série de
 * indicadores, waterfall, insights e alertas — tudo calculado do banco.
 */
executivoRouter.get(
  '/',
  ah(async (req, res) => {
    const ym = isValidYm(String(req.query.month ?? '')) ? String(req.query.month) : currentYm();

    const [series12, contrib, insights, alerts, wf, metaReceita] = await Promise.all([
      financeSeries(12, ym),
      contributionMarginAvg(),
      buildInsights(ym),
      evaluateAlerts(ym, 'executivo'),
      waterfall(ym),
      goalFor('receita_total', ym),
    ]);

    const atual = series12[series12.length - 1];
    const anterior = series12[series12.length - 2];
    const spark = (pick: (f: (typeof series12)[number]) => number) =>
      series12.slice(-6).map((f) => ({ label: f.label, value: pick(f) }));

    // Novos clientes: mês atual, anterior e sparkline de 6 meses
    const months6 = lastMonths(6, ym);
    const novosSeries = await Promise.all(months6.map((m) => newClientsIn(m)));
    const novosAtual = novosSeries[novosSeries.length - 1];
    const novosAnterior = await newClientsIn(lastMonths(2, ym)[0]);
    const metaNovos = await goalFor('novos_clientes', ym);

    res.json({
      month: ym,
      kpis: {
        receitaTotal: {
          value: atual.receitaBruta,
          varPct: pctChange(atual.receitaBruta, anterior.receitaBruta),
          spark: spark((f) => f.receitaBruta),
          meta: metaReceita,
          atingimentoPct: metaReceita && metaReceita > 0 ? (atual.receitaBruta / metaReceita) * 100 : null,
        },
        margemEbitda: {
          value: atual.margemEbitda,
          varPp:
            atual.margemEbitda !== null && anterior.margemEbitda !== null
              ? atual.margemEbitda - anterior.margemEbitda
              : null,
          spark: spark((f) => f.margemEbitda ?? 0),
        },
        lucroLiquido: {
          value: atual.lucroLiquido,
          varPct: pctChange(atual.lucroLiquido, anterior.lucroLiquido),
          spark: spark((f) => f.lucroLiquido),
        },
        // Margem de contribuição média dos produtos cadastrados em
        // Configurações → Produtos: (salePrice − costPrice) ÷ salePrice
        margemContribuicao: {
          value: contrib.avg,
          produtos: contrib.count,
        },
        // KPI 5 escolhido: NOVOS CLIENTES no mês (ticket médio ficou na aba
        // Vendas; exibi-lo aqui é variação futura)
        novosClientes: {
          value: novosAtual,
          varPct: pctChange(novosAtual, novosAnterior),
          spark: months6.map((m, i) => ({ label: ymLabel(m), value: novosSeries[i] })),
          meta: metaNovos,
        },
      },
      indicadores: series12.map((f) => ({
        label: f.label,
        receitaLiquida: f.receitaLiquida,
        lucroOperacional: f.lucroOperacional,
        ebitda: f.ebitda,
        margem: f.margemLiquida,
      })),
      waterfall: wf,
      insights,
      alerts,
      hasData: series12.some((f) => f.receitaBruta > 0 || f.despesasTotais > 0),
    });
  })
);
