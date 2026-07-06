import { Router } from 'express';
import { prisma } from '../db.js';
import { ah, HttpError, requireDate, requireNumber, requireString } from '../lib/http.js';
import { rangeFromQuery, ymLabel, ymOf } from '../lib/period.js';
import { EXPENSE_KINDS } from '../lib/constants.js';

export const despesasRouter = Router();

const DAY = 24 * 60 * 60 * 1000;

/** GET /api/despesas?from&to — mesma lógica da aba Receitas. */
despesasRouter.get(
  '/',
  ah(async (req, res) => {
    const r = rangeFromQuery(req.query.from as string | undefined, req.query.to as string | undefined);
    const rows = await prisma.expense.findMany({
      where: { date: { gte: r.start, lt: r.end } },
      orderBy: { date: 'desc' },
    });

    const total = rows.reduce((a, x) => a + x.amount, 0);
    const byCat = new Map<string, number>();
    for (const x of rows) byCat.set(x.category, (byCat.get(x.category) ?? 0) + x.amount);

    const byMonth = (r.end.getTime() - r.start.getTime()) / DAY > 62;
    const buckets = new Map<string, number>();
    for (const x of rows) {
      const key = byMonth ? ymOf(x.date) : x.date.toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) ?? 0) + x.amount);
    }
    const evolucao = [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({
        label: byMonth ? ymLabel(key) : key.slice(8, 10) + '/' + key.slice(5, 7),
        value,
      }));

    res.json({
      total,
      porCategoria: [...byCat.entries()]
        .map(([categoria, valor]) => ({ categoria, valor, pct: total > 0 ? (valor / total) * 100 : 0 }))
        .sort((a, b) => b.valor - a.valor),
      evolucao,
      itens: rows.map((x) => ({
        id: x.id,
        descricao: x.description,
        categoria: x.category,
        classificacao: x.kind,
        valor: x.amount,
        data: x.date.toISOString().slice(0, 10),
        source: x.source,
      })),
    });
  })
);

despesasRouter.post(
  '/',
  ah(async (req, res) => {
    const kind = String(req.body.kind ?? 'OPERACIONAL');
    if (!EXPENSE_KINDS.includes(kind as any))
      throw new HttpError(400, `Classificação inválida. Use: ${EXPENSE_KINDS.join(', ')}`);
    const created = await prisma.expense.create({
      data: {
        category: requireString(req.body.category, 'category'),
        kind,
        description: req.body.description ? String(req.body.description) : null,
        amount: requireNumber(req.body.amount, 'amount'),
        date: requireDate(req.body.date, 'date'),
      },
    });
    res.status(201).json(created);
  })
);

despesasRouter.put(
  '/:id',
  ah(async (req, res) => {
    const kind = req.body.kind ? String(req.body.kind) : undefined;
    if (kind && !EXPENSE_KINDS.includes(kind as any))
      throw new HttpError(400, `Classificação inválida. Use: ${EXPENSE_KINDS.join(', ')}`);
    const updated = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.category ? { category: String(req.body.category) } : {}),
        ...(kind ? { kind } : {}),
        ...(req.body.description !== undefined ? { description: req.body.description || null } : {}),
        ...(req.body.amount !== undefined ? { amount: requireNumber(req.body.amount, 'amount') } : {}),
        ...(req.body.date ? { date: requireDate(req.body.date, 'date') } : {}),
      },
    });
    res.json(updated);
  })
);

despesasRouter.delete(
  '/:id',
  ah(async (req, res) => {
    await prisma.expense.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
