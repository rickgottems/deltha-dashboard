import { Router } from 'express';
import { ah, HttpError } from '../lib/http.js';
import { rangeFromQuery } from '../lib/period.js';
import { buildReport, toExcel, toPdf } from '../services/exporter.js';

export const relatoriosRouter = Router();

const TABS = ['executivo', 'financeiro', 'receitas', 'despesas', 'vendas', 'clientes', 'operacoes'] as const;

relatoriosRouter.get(
  '/tabs',
  ah(async (_req, res) => {
    res.json(
      TABS.map((t) => ({
        key: t,
        label: t === 'operacoes' ? 'Operações' : t.charAt(0).toUpperCase() + t.slice(1),
      }))
    );
  })
);

/** GET /api/relatorios/export?tab=receitas&from=YYYY-MM-DD&to=YYYY-MM-DD&format=pdf|xlsx */
relatoriosRouter.get(
  '/export',
  ah(async (req, res) => {
    const tab = String(req.query.tab ?? '');
    const format = String(req.query.format ?? 'pdf');
    if (!TABS.includes(tab as any)) throw new HttpError(400, `Aba inválida. Use: ${TABS.join(', ')}`);
    if (!['pdf', 'xlsx'].includes(format)) throw new HttpError(400, 'Formato inválido. Use pdf ou xlsx');

    const r = rangeFromQuery(req.query.from as string | undefined, req.query.to as string | undefined);
    const report = await buildReport(tab, r, req.companyId!);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `relatorio-${tab}-${stamp}.${format}`;

    if (format === 'xlsx') {
      const buffer = await toExcel(report);
      res
        .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer);
    } else {
      const buffer = await toPdf(report);
      res
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer);
    }
  })
);
