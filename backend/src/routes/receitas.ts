import { Router } from 'express';
import { prisma } from '../db.js';
import { ah, HttpError, optionalDate, requireDate, requireNumber, requireString } from '../lib/http.js';
import { rangeFromQuery, ymLabel, ymOf } from '../lib/period.js';
import { RECEIVABLE_STATUS } from '../lib/constants.js';

export const receitasRouter = Router();

const DAY = 24 * 60 * 60 * 1000;

/**
 * GET /api/receitas?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Lista do período + breakdown por categoria + evolução (linha).
 * Evolução agregada por dia (períodos ≤ 62 dias) ou por mês.
 */
receitasRouter.get(
  '/',
  ah(async (req, res) => {
    const r = rangeFromQuery(req.query.from as string | undefined, req.query.to as string | undefined);
    const rows = await prisma.receivable.findMany({
      where: { dueDate: { gte: r.start, lt: r.end } },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'desc' },
    });

    const ativos = rows.filter((x) => x.status !== 'CANCELADA');
    const total = ativos.reduce((a, x) => a + x.amount, 0);
    const recebido = ativos.filter((x) => x.status === 'PAGA').reduce((a, x) => a + x.amount, 0);

    const byCat = new Map<string, number>();
    for (const x of ativos) byCat.set(x.category, (byCat.get(x.category) ?? 0) + x.amount);

    const byMonth = (r.end.getTime() - r.start.getTime()) / DAY > 62;
    const buckets = new Map<string, number>();
    for (const x of ativos) {
      const key = byMonth ? ymOf(x.dueDate) : x.dueDate.toISOString().slice(0, 10);
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
      recebido,
      emAberto: total - recebido,
      porCategoria: [...byCat.entries()]
        .map(([categoria, valor]) => ({ categoria, valor, pct: total > 0 ? (valor / total) * 100 : 0 }))
        .sort((a, b) => b.valor - a.valor),
      evolucao,
      itens: rows.map((x) => ({
        id: x.id,
        descricao: x.description,
        categoria: x.category,
        cliente: x.client,
        valor: x.amount,
        vencimento: x.dueDate.toISOString().slice(0, 10),
        pagamento: x.paidDate ? x.paidDate.toISOString().slice(0, 10) : null,
        status: x.status,
        source: x.source,
      })),
    });
  })
);

receitasRouter.post(
  '/',
  ah(async (req, res) => {
    const status = String(req.body.status ?? 'PENDENTE');
    if (!RECEIVABLE_STATUS.includes(status as any))
      throw new HttpError(400, `Status inválido. Use: ${RECEIVABLE_STATUS.join(', ')}`);
    const created = await prisma.receivable.create({
      data: {
        description: req.body.description ? String(req.body.description) : null,
        category: requireString(req.body.category, 'category'),
        amount: requireNumber(req.body.amount, 'amount'),
        dueDate: requireDate(req.body.dueDate, 'dueDate'),
        paidDate: optionalDate(req.body.paidDate),
        status,
        clientId: req.body.clientId ? String(req.body.clientId) : null,
      },
    });
    res.status(201).json(created);
  })
);

receitasRouter.put(
  '/:id',
  ah(async (req, res) => {
    const status = req.body.status ? String(req.body.status) : undefined;
    if (status && !RECEIVABLE_STATUS.includes(status as any))
      throw new HttpError(400, `Status inválido. Use: ${RECEIVABLE_STATUS.join(', ')}`);
    const updated = await prisma.receivable.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.description !== undefined ? { description: req.body.description || null } : {}),
        ...(req.body.category ? { category: String(req.body.category) } : {}),
        ...(req.body.amount !== undefined ? { amount: requireNumber(req.body.amount, 'amount') } : {}),
        ...(req.body.dueDate ? { dueDate: requireDate(req.body.dueDate, 'dueDate') } : {}),
        ...(req.body.paidDate !== undefined ? { paidDate: optionalDate(req.body.paidDate) } : {}),
        ...(status ? { status } : {}),
        ...(req.body.clientId !== undefined ? { clientId: req.body.clientId || null } : {}),
      },
    });
    res.json(updated);
  })
);

receitasRouter.delete(
  '/:id',
  ah(async (req, res) => {
    await prisma.receivable.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
