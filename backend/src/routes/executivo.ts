import { Router } from 'express';
import { ah } from '../lib/http.js';
import { currentYm, isValidYm, lastMonths, prevPeriod, ymLabel } from '../lib/period.js';
import {
  contributionMarginAvg,
  financeSeries,
  goalFor,
  newClientsIn,
  newClientsInRange,
  pctChange,
  periodFinance,
  waterfallFromFinance,
} from '../services/finance.js';
import { buildInsights } from '../services/insights.js';
import { evaluateAlerts } from '../services/alerts.js';
import { evaluateDreAlerts } from '../services/dreAlerts.js';

export const executivoRouter = Router();

/**
 * GET /api/executivo?from=YYYY-MM&to=YYYY-MM&clientId=xxx
 * (aceita também ?month=YYYY-MM, forma antiga, equivalente a from=to=month)
 * Payload completo da tela Executivo: KPIs (com sparkline), série de
 * indicadores, waterfall, insights e alertas — tudo calculado do banco.
 * clientId recorta apenas a Receita Total (ver nota em services/finance.ts);
 * insights/alerts continuam ancorados no último mês do período (toYm).
 */
executivoRouter.get(
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

    const opts = clientId ? { clientId } : {};
    const prev = prevPeriod(fromYm, toYm);

    const [atual, anterior, series12, contrib, insights, alerts, dreAlerts, metaReceita] = await Promise.all([
      periodFinance(fromYm, toYm, opts),
      periodFinance(prev.fromYm, prev.toYm, opts),
      financeSeries(12, toYm, opts),
      contributionMarginAvg(),
      buildInsights(toYm),
      evaluateAlerts(toYm, 'executivo'),
      evaluateDreAlerts(fromYm, toYm, opts),
      goalFor('receita_total', toYm),
    ]);

    const spark = (pick: (f: (typeof series12)[number]) => number) =>
      series12.slice(-6).map((f) => ({ label: f.label, value: pick(f) }));

    // Novos clientes: período atual, anterior (mesma duração) e sparkline de 6 meses.
    // Não é afetado por clientId (não faz sentido contar "novos clientes" de 1 cliente).
    const months6 = lastMonths(6, toYm);
    const novosSeries = await Promise.all(months6.map((m) => newClientsIn(m)));
    const novosAtual = await newClientsInRange(fromYm, toYm);
    const novosAnterior = await newClientsInRange(prev.fromYm, prev.toYm);
    const metaNovos = await goalFor('novos_clientes', toYm);

    res.json({
      fromYm,
      toYm,
      month: toYm,
      clientFiltered: atual.clientFiltered,
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
        // KPI 5 escolhido: NOVOS CLIENTES no período (ticket médio ficou na aba
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
      waterfall: waterfallFromFinance(atual),
      insights,
      alerts,
      dreAlerts,
      hasData: series12.some((f) => f.receitaBruta > 0 || f.despesasTotais > 0),
    });
  })
);
