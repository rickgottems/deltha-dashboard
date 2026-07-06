import { Router } from 'express';
import { prisma } from '../db.js';
import { ah, HttpError, requireNumber, requireString } from '../lib/http.js';
import {
  ALERT_METRICS,
  EXPENSE_KINDS,
  GOAL_DEFAULT_PERIOD,
  GOAL_METRICS,
  RECEIVABLE_STATUS,
  THRESHOLD_DIRECTIONS,
} from '../lib/constants.js';
import { getStatus as calendarStatus } from '../services/calendar.js';

export const configRouter = Router();

/* ---------------- Produtos (CRUD usado pela margem de contribuição) ---------------- */

configRouter.get(
  '/produtos',
  ah(async (_req, res) => {
    const rows = await prisma.product.findMany({ orderBy: { name: 'asc' } });
    res.json(
      rows.map((p) => ({
        ...p,
        // Margem de contribuição unitária: (venda − custo) ÷ venda
        margemContribuicao: p.salePrice > 0 ? ((p.salePrice - p.costPrice) / p.salePrice) * 100 : null,
      }))
    );
  })
);

configRouter.post(
  '/produtos',
  ah(async (req, res) => {
    const created = await prisma.product.create({
      data: {
        name: requireString(req.body.name, 'name'),
        costPrice: requireNumber(req.body.costPrice, 'costPrice'),
        salePrice: requireNumber(req.body.salePrice, 'salePrice'),
        active: req.body.active === undefined ? true : Boolean(req.body.active),
      },
    });
    res.status(201).json(created);
  })
);

configRouter.put(
  '/produtos/:id',
  ah(async (req, res) => {
    const updated = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.name ? { name: String(req.body.name) } : {}),
        ...(req.body.costPrice !== undefined ? { costPrice: requireNumber(req.body.costPrice, 'costPrice') } : {}),
        ...(req.body.salePrice !== undefined ? { salePrice: requireNumber(req.body.salePrice, 'salePrice') } : {}),
        ...(req.body.active !== undefined ? { active: Boolean(req.body.active) } : {}),
      },
    });
    res.json(updated);
  })
);

configRouter.delete(
  '/produtos/:id',
  ah(async (req, res) => {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

/* ---------------- Metas (financeiras e de vendas) ---------------- */

configRouter.get(
  '/metas',
  ah(async (_req, res) => {
    const rows = await prisma.goal.findMany({ orderBy: [{ metricKey: 'asc' }, { period: 'asc' }] });
    res.json({
      metricas: GOAL_METRICS,
      metas: rows,
    });
  })
);

configRouter.put(
  '/metas',
  ah(async (req, res) => {
    const metricKey = requireString(req.body.metricKey, 'metricKey');
    if (!GOAL_METRICS.some((g) => g.key === metricKey))
      throw new HttpError(400, `Métrica de meta desconhecida: ${metricKey}`);
    const period = req.body.period ? String(req.body.period) : GOAL_DEFAULT_PERIOD;
    if (period !== GOAL_DEFAULT_PERIOD && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
      throw new HttpError(400, 'period deve ser "default" ou "YYYY-MM"');
    const value = requireNumber(req.body.value, 'value');
    const saved = await prisma.goal.upsert({
      where: { metricKey_period: { metricKey, period } },
      create: { metricKey, period, value },
      update: { value },
    });
    res.json(saved);
  })
);

configRouter.delete(
  '/metas/:id',
  ah(async (req, res) => {
    await prisma.goal.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

/* ---------------- Thresholds de alerta (crítico/atenção/confortável) ---------------- */

configRouter.get(
  '/thresholds',
  ah(async (_req, res) => {
    const rows = await prisma.alertThreshold.findMany();
    // Devolve o catálogo de métricas + regra cadastrada (se houver)
    res.json(
      ALERT_METRICS.map((m) => {
        const row = rows.find((r) => r.metricKey === m.key);
        return {
          metricKey: m.key,
          label: m.label,
          unit: m.unit,
          description: m.description,
          defaultDirection: m.defaultDirection,
          configured: Boolean(row),
          id: row?.id ?? null,
          yellowThreshold: row?.yellowThreshold ?? null,
          redThreshold: row?.redThreshold ?? null,
          direction: row?.direction ?? m.defaultDirection,
          scope: row?.scope ?? m.scope,
        };
      })
    );
  })
);

configRouter.put(
  '/thresholds/:metricKey',
  ah(async (req, res) => {
    const metricKey = req.params.metricKey;
    const def = ALERT_METRICS.find((m) => m.key === metricKey);
    if (!def) throw new HttpError(400, `Métrica de alerta desconhecida: ${metricKey}`);
    const direction = String(req.body.direction ?? def.defaultDirection);
    if (!THRESHOLD_DIRECTIONS.includes(direction as any))
      throw new HttpError(400, 'direction deve ser BELOW ou ABOVE');
    const scope = String(req.body.scope ?? def.scope);
    if (!['executivo', 'financeiro', 'ambos'].includes(scope))
      throw new HttpError(400, 'scope deve ser executivo, financeiro ou ambos');
    const yellowThreshold = requireNumber(req.body.yellowThreshold, 'yellowThreshold');
    const redThreshold = requireNumber(req.body.redThreshold, 'redThreshold');

    const saved = await prisma.alertThreshold.upsert({
      where: { metricKey },
      create: {
        metricKey,
        label: def.label,
        unit: def.unit,
        yellowThreshold,
        redThreshold,
        direction,
        scope,
      },
      update: { yellowThreshold, redThreshold, direction, scope },
    });
    res.json(saved);
  })
);

configRouter.delete(
  '/thresholds/:metricKey',
  ah(async (req, res) => {
    await prisma.alertThreshold.deleteMany({ where: { metricKey: req.params.metricKey } });
    res.status(204).end();
  })
);

/* ---------------- Catálogos e integrações ---------------- */

configRouter.get(
  '/catalogos',
  ah(async (_req, res) => {
    const [clients, products, sellers, teams] = await Promise.all([
      prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.product.findMany({ select: { id: true, name: true, salePrice: true }, where: { active: true }, orderBy: { name: 'asc' } }),
      prisma.seller.findMany({ orderBy: { name: 'asc' } }),
      prisma.team.findMany({ orderBy: { name: 'asc' } }),
    ]);
    res.json({
      clients,
      products,
      sellers,
      teams,
      expenseKinds: EXPENSE_KINDS,
      receivableStatus: RECEIVABLE_STATUS,
    });
  })
);

configRouter.get(
  '/integracoes',
  ah(async (_req, res) => {
    res.json({ googleCalendar: await calendarStatus() });
  })
);

/* ---------------- Vendedores (suporte à aba Vendas) ---------------- */

configRouter.post(
  '/vendedores',
  ah(async (req, res) => {
    const created = await prisma.seller.create({ data: { name: requireString(req.body.name, 'name') } });
    res.status(201).json(created);
  })
);

configRouter.delete(
  '/vendedores/:id',
  ah(async (req, res) => {
    await prisma.seller.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
