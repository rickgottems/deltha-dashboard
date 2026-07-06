import { Router } from 'express';
import { prisma } from '../db.js';
import { ah, requireDate, requireNumber } from '../lib/http.js';
import { currentYm, isValidYm, lastMonths, monthRange, ymLabel } from '../lib/period.js';
import { goalFor, pctChange, salesSummary } from '../services/finance.js';

export const vendasRouter = Router();

/**
 * GET /api/vendas/summary?month=YYYY-MM
 * KPIs (faturamento, meta + % restante, ticket médio, clientes ativos),
 * ranking de compradores, produtos mais vendidos e evolução mensal.
 */
vendasRouter.get(
  '/summary',
  ah(async (req, res) => {
    const ym = isValidYm(String(req.query.month ?? '')) ? String(req.query.month) : currentYm();
    const r = monthRange(ym);
    const prev = lastMonths(2, ym)[0];

    const [atual, anterior, meta] = await Promise.all([
      salesSummary(ym),
      salesSummary(prev),
      goalFor('faturamento_vendas', ym),
    ]);

    // Clientes ativos: com pelo menos 1 compra nos últimos 90 dias
    const activeSince = new Date(r.end.getTime() - 90 * 24 * 60 * 60 * 1000);
    const ativos = await prisma.sale.findMany({
      where: { date: { gte: activeSince, lt: r.end }, clientId: { not: null } },
      select: { clientId: true },
      distinct: ['clientId'],
    });

    // Ranking de melhores compradores (mês)
    const compras = await prisma.sale.groupBy({
      by: ['clientId'],
      _sum: { amount: true },
      _count: { id: true },
      where: { date: { gte: r.start, lt: r.end }, clientId: { not: null } },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    });
    const clientes = await prisma.client.findMany({
      where: { id: { in: compras.map((c) => c.clientId!).filter(Boolean) } },
    });
    const ranking = compras.map((c, i) => ({
      posicao: i + 1,
      cliente: clientes.find((x) => x.id === c.clientId)?.name ?? '(cliente removido)',
      total: c._sum.amount ?? 0,
      compras: c._count.id,
    }));

    // Produtos mais vendidos (mês)
    const porProduto = await prisma.sale.groupBy({
      by: ['productId'],
      _sum: { amount: true, quantity: true },
      where: { date: { gte: r.start, lt: r.end } },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    });
    const produtos = await prisma.product.findMany({
      where: { id: { in: porProduto.map((p) => p.productId!).filter(Boolean) } },
    });
    const maisVendidos = porProduto.map((p, i) => ({
      posicao: i + 1,
      produto: p.productId ? (produtos.find((x) => x.id === p.productId)?.name ?? '(produto removido)') : '(sem produto)',
      faturamento: p._sum.amount ?? 0,
      quantidade: p._sum.quantity ?? 0,
    }));

    // Evolução mensal de vendas (12 meses) — gráfico de LINHA
    const months12 = lastMonths(12, ym);
    const evolucao = await Promise.all(
      months12.map(async (m) => {
        const s = await salesSummary(m);
        return { label: ymLabel(m), valor: s.total };
      })
    );

    res.json({
      month: ym,
      kpis: {
        faturamento: { value: atual.total, varPct: pctChange(atual.total, anterior.total) },
        meta: {
          value: meta,
          atingidoPct: meta && meta > 0 ? (atual.total / meta) * 100 : null,
          restantePct: meta && meta > 0 ? Math.max(0, 100 - (atual.total / meta) * 100) : null,
          restanteValor: meta ? Math.max(0, meta - atual.total) : null,
        },
        ticketMedio: { value: atual.ticket, varPct: atual.ticket !== null && anterior.ticket !== null ? pctChange(atual.ticket, anterior.ticket) : null },
        clientesAtivos: { value: ativos.length },
      },
      ranking,
      maisVendidos,
      evolucao,
    });
  })
);

/** GET /api/vendas?month=YYYY-MM — lançamentos do mês. */
vendasRouter.get(
  '/',
  ah(async (req, res) => {
    const ym = isValidYm(String(req.query.month ?? '')) ? String(req.query.month) : currentYm();
    const r = monthRange(ym);
    const rows = await prisma.sale.findMany({
      where: { date: { gte: r.start, lt: r.end } },
      include: {
        product: { select: { name: true } },
        client: { select: { name: true } },
        seller: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
    });
    res.json(
      rows.map((s) => ({
        id: s.id,
        data: s.date.toISOString().slice(0, 10),
        produto: s.product?.name ?? null,
        cliente: s.client?.name ?? null,
        vendedor: s.seller?.name ?? null,
        quantidade: s.quantity,
        valor: s.amount,
        source: s.source,
      }))
    );
  })
);

vendasRouter.post(
  '/',
  ah(async (req, res) => {
    const quantity = Math.max(1, Math.round(requireNumber(req.body.quantity ?? 1, 'quantity')));
    let amount = req.body.amount !== undefined && req.body.amount !== '' ? requireNumber(req.body.amount, 'amount') : null;

    // Sem valor informado: usa preço de venda do produto × quantidade
    if (amount === null && req.body.productId) {
      const product = await prisma.product.findUnique({ where: { id: String(req.body.productId) } });
      if (product) amount = product.salePrice * quantity;
    }

    const created = await prisma.sale.create({
      data: {
        productId: req.body.productId ? String(req.body.productId) : null,
        clientId: req.body.clientId ? String(req.body.clientId) : null,
        sellerId: req.body.sellerId ? String(req.body.sellerId) : null,
        quantity,
        amount: amount ?? 0,
        date: requireDate(req.body.date, 'date'),
      },
    });
    res.status(201).json(created);
  })
);

vendasRouter.delete(
  '/:id',
  ah(async (req, res) => {
    await prisma.sale.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
