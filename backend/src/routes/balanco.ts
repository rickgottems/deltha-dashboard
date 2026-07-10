// Balanço Patrimonial e DFC — lançamento manual por período (Configurações
// → Balanço/DFC). Ver nota de por que são tabelas próprias em
// prisma/schema.prisma (nada disso é derivável do resto dos dados).

import { Router } from 'express';
import { prisma } from '../db.js';
import { ah, HttpError, requireNumber, requireString } from '../lib/http.js';
import { isValidYm } from '../lib/period.js';
import { validateBalanceSheet } from '../services/healthScore.js';

export const balancoRouter = Router();

function requireYm(value: unknown): string {
  const ym = requireString(value, 'period');
  if (!isValidYm(ym)) throw new HttpError(400, 'period deve estar no formato YYYY-MM');
  return ym;
}

/** GET /api/balanco?period=YYYY-MM — devolve o que já foi lançado nesse mês (ou null). */
balancoRouter.get(
  '/',
  ah(async (req, res) => {
    const companyId = req.companyId!;
    const period = requireYm(req.query.period);
    const [balanceSheet, cashFlow] = await Promise.all([
      prisma.balanceSheet.findUnique({ where: { companyId_period: { companyId, period } } }),
      prisma.cashFlowStatement.findUnique({ where: { companyId_period: { companyId, period } } }),
    ]);
    res.json({ period, balanceSheet, cashFlow });
  })
);

/** GET /api/balanco/periodos — meses (YYYY-MM) que já têm Balanço ou DFC lançado. */
balancoRouter.get(
  '/periodos',
  ah(async (req, res) => {
    const companyId = req.companyId!;
    const [bsRows, cfRows] = await Promise.all([
      prisma.balanceSheet.findMany({ where: { companyId }, select: { period: true } }),
      prisma.cashFlowStatement.findMany({ where: { companyId }, select: { period: true } }),
    ]);
    const periods = [...new Set([...bsRows.map((r) => r.period), ...cfRows.map((r) => r.period)])].sort();
    res.json(periods);
  })
);

balancoRouter.put(
  '/balance-sheet',
  ah(async (req, res) => {
    const companyId = req.companyId!;
    const period = requireYm(req.body.period);
    const data = {
      currentAssets: requireNumber(req.body.currentAssets, 'currentAssets'),
      inventory: requireNumber(req.body.inventory, 'inventory'),
      nonCurrentAssets: requireNumber(req.body.nonCurrentAssets, 'nonCurrentAssets'),
      currentLiabilities: requireNumber(req.body.currentLiabilities, 'currentLiabilities'),
      shortTermDebt: requireNumber(req.body.shortTermDebt, 'shortTermDebt'),
      longTermDebt: requireNumber(req.body.longTermDebt, 'longTermDebt'),
      cashAndEquivalents: requireNumber(req.body.cashAndEquivalents, 'cashAndEquivalents'),
      equity: requireNumber(req.body.equity, 'equity'),
    };
    const validationError = validateBalanceSheet(data);
    if (validationError) throw new HttpError(400, validationError);

    const saved = await prisma.balanceSheet.upsert({
      where: { companyId_period: { companyId, period } },
      create: { companyId, period, ...data },
      update: data,
    });
    res.json(saved);
  })
);

balancoRouter.put(
  '/cash-flow',
  ah(async (req, res) => {
    const companyId = req.companyId!;
    const period = requireYm(req.body.period);
    const data = {
      operatingCashFlow: requireNumber(req.body.operatingCashFlow, 'operatingCashFlow'),
      capex: requireNumber(req.body.capex, 'capex'),
    };
    const saved = await prisma.cashFlowStatement.upsert({
      where: { companyId_period: { companyId, period } },
      create: { companyId, period, ...data },
      update: data,
    });
    res.json(saved);
  })
);
