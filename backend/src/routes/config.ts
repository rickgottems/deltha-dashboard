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
  ah(async (req, res) => {
    const rows = await prisma.product.findMany({ where: { companyId: req.companyId! }, orderBy: { name: 'asc' } });
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
        companyId: req.companyId!,
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
    const result = await prisma.product.updateMany({
      where: { id: req.params.id, companyId: req.companyId! },
      data: {
        ...(req.body.name ? { name: String(req.body.name) } : {}),
        ...(req.body.costPrice !== undefined ? { costPrice: requireNumber(req.body.costPrice, 'costPrice') } : {}),
        ...(req.body.salePrice !== undefined ? { salePrice: requireNumber(req.body.salePrice, 'salePrice') } : {}),
        ...(req.body.active !== undefined ? { active: Boolean(req.body.active) } : {}),
      },
    });
    if (result.count === 0) throw new HttpError(404, 'Produto não encontrado');
    const updated = await prisma.product.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  })
);

configRouter.delete(
  '/produtos/:id',
  ah(async (req, res) => {
    const result = await prisma.product.deleteMany({ where: { id: req.params.id, companyId: req.companyId! } });
    if (result.count === 0) throw new HttpError(404, 'Produto não encontrado');
    res.status(204).end();
  })
);

/* ---------------- Metas (financeiras e de vendas) ---------------- */

configRouter.get(
  '/metas',
  ah(async (req, res) => {
    const rows = await prisma.goal.findMany({
      where: { companyId: req.companyId! },
      orderBy: [{ metricKey: 'asc' }, { period: 'asc' }],
    });
    res.json({
      metricas: GOAL_METRICS,
      metas: rows,
    });
  })
);

configRouter.put(
  '/metas',
  ah(async (req, res) => {
    const companyId = req.companyId!;
    const metricKey = requireString(req.body.metricKey, 'metricKey');
    if (!GOAL_METRICS.some((g) => g.key === metricKey))
      throw new HttpError(400, `Métrica de meta desconhecida: ${metricKey}`);
    const period = req.body.period ? String(req.body.period) : GOAL_DEFAULT_PERIOD;
    if (period !== GOAL_DEFAULT_PERIOD && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
      throw new HttpError(400, 'period deve ser "default" ou "YYYY-MM"');
    const value = requireNumber(req.body.value, 'value');
    const saved = await prisma.goal.upsert({
      where: { companyId_metricKey_period: { companyId, metricKey, period } },
      create: { companyId, metricKey, period, value },
      update: { value },
    });
    res.json(saved);
  })
);

configRouter.delete(
  '/metas/:id',
  ah(async (req, res) => {
    const result = await prisma.goal.deleteMany({ where: { id: req.params.id, companyId: req.companyId! } });
    if (result.count === 0) throw new HttpError(404, 'Meta não encontrada');
    res.status(204).end();
  })
);

/* ---------------- Thresholds de alerta (crítico/atenção/confortável) ---------------- */

configRouter.get(
  '/thresholds',
  ah(async (req, res) => {
    const rows = await prisma.alertThreshold.findMany({ where: { companyId: req.companyId! } });
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
    const companyId = req.companyId!;
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
      where: { companyId_metricKey: { companyId, metricKey } },
      create: {
        companyId,
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
    await prisma.alertThreshold.deleteMany({ where: { metricKey: req.params.metricKey, companyId: req.companyId! } });
    res.status(204).end();
  })
);

/* ---------------- Catálogos e integrações ---------------- */

configRouter.get(
  '/catalogos',
  ah(async (req, res) => {
    const companyId = req.companyId!;
    const [clients, products, sellers, teams] = await Promise.all([
      prisma.client.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.product.findMany({ where: { companyId, active: true }, select: { id: true, name: true, salePrice: true }, orderBy: { name: 'asc' } }),
      prisma.seller.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
      prisma.team.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
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
  ah(async (req, res) => {
    res.json({ googleCalendar: await calendarStatus(req.companyId!) });
  })
);

/* ---------------- Vendedores (suporte à aba Vendas) ---------------- */

configRouter.post(
  '/vendedores',
  ah(async (req, res) => {
    const created = await prisma.seller.create({
      data: { name: requireString(req.body.name, 'name'), companyId: req.companyId! },
    });
    res.status(201).json(created);
  })
);

configRouter.delete(
  '/vendedores/:id',
  ah(async (req, res) => {
    const result = await prisma.seller.deleteMany({ where: { id: req.params.id, companyId: req.companyId! } });
    if (result.count === 0) throw new HttpError(404, 'Vendedor não encontrado');
    res.status(204).end();
  })
);
