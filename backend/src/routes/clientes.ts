import { Router } from 'express';
import { prisma } from '../db.js';
import { ah, HttpError, requireString } from '../lib/http.js';
import { riskByClient } from '../services/risk.js';

export const clientesRouter = Router();

/**
 * GET /api/clientes?search=&risk=BAIXO|MEDIO|ALTO
 * Lista completa com total comprado, última compra e score de risco de
 * inadimplência (heurística v1 documentada em services/risk.ts).
 */
clientesRouter.get(
  '/',
  ah(async (req, res) => {
    const companyId = req.companyId!;
    const search = String(req.query.search ?? '').trim();
    const riskFilter = String(req.query.risk ?? '').trim();

    const [clients, risks] = await Promise.all([
      prisma.client.findMany({
        where: {
          companyId,
          ...(search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] } : {}),
        },
        include: {
          sales: { select: { amount: true, date: true } },
        },
        orderBy: { name: 'asc' },
      }),
      riskByClient(companyId),
    ]);

    let out = clients.map((c) => {
      const total = c.sales.reduce((a, s) => a + s.amount, 0);
      const ultima = c.sales.reduce<Date | null>(
        (acc, s) => (acc === null || s.date > acc ? s.date : acc),
        null
      );
      const risk = risks.get(c.id) ?? {
        level: 'SEM_HISTORICO' as const,
        pctAtraso: null,
        mediaDiasAtraso: null,
        totalFaturas: 0,
        faturasAtrasadas: 0,
        valorEmAberto: 0,
      };
      return {
        id: c.id,
        nome: c.name,
        email: c.email,
        telefone: c.phone,
        desde: c.createdAt.toISOString().slice(0, 10),
        totalComprado: total,
        compras: c.sales.length,
        ultimaCompra: ultima ? ultima.toISOString().slice(0, 10) : null,
        risco: risk,
      };
    });

    if (riskFilter) out = out.filter((c) => c.risco.level === riskFilter);
    res.json(out);
  })
);

/** GET /api/clientes/ranking — melhores compradores por valor total (todos os tempos). */
clientesRouter.get(
  '/ranking',
  ah(async (req, res) => {
    const companyId = req.companyId!;
    const grouped = await prisma.sale.groupBy({
      by: ['clientId'],
      _sum: { amount: true },
      _count: { id: true },
      where: { companyId, clientId: { not: null } },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    });
    const clients = await prisma.client.findMany({
      where: { companyId, id: { in: grouped.map((g) => g.clientId!).filter(Boolean) } },
    });
    res.json(
      grouped.map((g, i) => ({
        posicao: i + 1,
        id: g.clientId,
        cliente: clients.find((c) => c.id === g.clientId)?.name ?? '(cliente removido)',
        total: g._sum.amount ?? 0,
        compras: g._count.id,
      }))
    );
  })
);

clientesRouter.post(
  '/',
  ah(async (req, res) => {
    const companyId = req.companyId!;
    const created = await prisma.client.create({
      data: {
        companyId,
        name: requireString(req.body.name, 'name'),
        email: req.body.email ? String(req.body.email) : null,
        phone: req.body.phone ? String(req.body.phone) : null,
      },
    });
    res.status(201).json(created);
  })
);

clientesRouter.put(
  '/:id',
  ah(async (req, res) => {
    const companyId = req.companyId!;
    const result = await prisma.client.updateMany({
      where: { id: req.params.id, companyId },
      data: {
        ...(req.body.name ? { name: String(req.body.name) } : {}),
        ...(req.body.email !== undefined ? { email: req.body.email || null } : {}),
        ...(req.body.phone !== undefined ? { phone: req.body.phone || null } : {}),
      },
    });
    if (result.count === 0) throw new HttpError(404, 'Cliente não encontrado');
    const updated = await prisma.client.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  })
);

clientesRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const companyId = req.companyId!;
    const result = await prisma.client.deleteMany({ where: { id: req.params.id, companyId } });
    if (result.count === 0) throw new HttpError(404, 'Cliente não encontrado');
    res.status(204).end();
  })
);
