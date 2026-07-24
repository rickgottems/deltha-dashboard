// ============================================================
// SEED DE TESTE — DOCUMENTOS REAIS GRAN CARNES (npm run db:test:grancarnes)
//
// Cria (ou reaproveita) uma empresa de teste dedicada e ISOLADA — diferente
// da "Empresa Demo" (seed-demo.ts) — e grava nela os valores extraídos dos
// documentos contábeis reais da Gran Carnes (Balanço Patrimonial, DFC e
// Faturamento mensal 2025), mapeados e confirmados em sessão com o usuário.
//
// Não usa o CNPJ real da Gran Carnes (65.978.488/0001-71) para não colidir
// com um cadastro de produção futuro dessa mesma empresa no sistema.
//
// Para limpar: npm run db:test:grancarnes:clean (apaga só esta empresa).
// ============================================================

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_EMAIL = 'teste.grancarnes@deltha.local';
const TEST_PASSWORD = 'teste12345';
const COMPANY_NAME = 'TESTE - Gran Carnes (dados reais)';

// Faturamento — JANEIRO A DEZEMBRO 2025 (fonte: FATURAMENTO - GRANCARNES 2025.pdf)
const faturamentoMensal2025: { month: number; amount: number }[] = [
  { month: 1, amount: 31505643.86 },
  { month: 2, amount: 31920200.92 },
  { month: 3, amount: 27495889.21 },
  { month: 4, amount: 36418571.38 },
  { month: 5, amount: 38439832.79 },
  { month: 6, amount: 35042774.05 },
  { month: 7, amount: 42960762.4 },
  { month: 8, amount: 37762237.59 },
  { month: 9, amount: 40247037.2 },
  { month: 10, amount: 42785279.63 },
  { month: 11, amount: 46581936.8 },
  { month: 12, amount: 42891352.66 },
];

function lastDayOfMonth(year: number, month: number): Date {
  // month é 1-based; dia 0 do mês seguinte = último dia do mês atual (UTC)
  return new Date(Date.UTC(year, month, 0));
}

async function main() {
  let user = await prisma.user.findUnique({ where: { email: TEST_EMAIL }, include: { company: true } });
  if (!user) {
    const company = await prisma.company.create({ data: { name: COMPANY_NAME, accountType: 'DELTHA_CLIENT' } });
    user = await prisma.user.create({
      data: {
        companyId: company.id,
        email: TEST_EMAIL,
        name: 'Usuário Teste Gran Carnes',
        passwordHash: await bcrypt.hash(TEST_PASSWORD, 12),
      },
      include: { company: true },
    });
    console.log(`✔ Empresa de teste criada. Login: ${TEST_EMAIL} / senha: ${TEST_PASSWORD}`);
  } else {
    console.log(`✔ Empresa de teste já existia (${user.companyId}) — reaproveitando.`);
  }
  const companyId = user.companyId;

  /* ---------- Balanço Patrimonial (fonte: Balanço Patrimonial Gran Carnes.pdf / Balanço 2025.pdf) ---------- */
  await prisma.balanceSheet.upsert({
    where: { companyId_period: { companyId, period: '2025-12' } },
    create: {
      companyId,
      period: '2025-12',
      currentAssets: 85047257.04,
      inventory: 28595982.94,
      nonCurrentAssets: 40058548.35,
      currentLiabilities: 18984038.77,
      shortTermDebt: 8431671.71, // Financiamentos + Títulos a Pagar + Empréstimo a Terceiros (dentro do Passivo Circulante)
      longTermDebt: 31837404.85, // Passivo Não Circulante (total)
      cashAndEquivalents: 1375935.94,
      equity: 74284361.77,
    },
    update: {},
  });

  await prisma.balanceSheet.upsert({
    where: { companyId_period: { companyId, period: '2026-03' } },
    create: {
      companyId,
      period: '2026-03',
      currentAssets: 92348867.95,
      inventory: 22522128.99,
      nonCurrentAssets: 39136395.03,
      currentLiabilities: 37024550.75,
      shortTermDebt: 9380650.47, // Financiamentos + Títulos a Pagar + Empréstimo de Terceiros (dentro do Passivo Circulante)
      longTermDebt: 14907036.93, // Passivo Não Circulante (total)
      cashAndEquivalents: 1633706.63,
      equity: 79553675.3,
    },
    update: {},
  });

  /* ---------- DFC (fonte: D.F.C Gran Carnes.pdf — período 01/01/2026 a 31/03/2026) ---------- */
  await prisma.cashFlowStatement.upsert({
    where: { companyId_period: { companyId, period: '2026-03' } },
    create: {
      companyId,
      period: '2026-03',
      operatingCashFlow: 15837775.97,
      capex: 167485.02, // magnitude positiva (PDF mostra -167.485,02 como saída de caixa)
    },
    update: {},
  });

  /* ---------- Faturamento mensal 2025 → Receivable (fonte: FATURAMENTO - GRANCARNES 2025.pdf) ----------
     Sem discriminação por cliente/nota fiscal no documento original, por isso 1 lançamento agregado
     por mês, sem clientId, status PAGA (assume-se faturamento já realizado/encerrado no exercício). */
  const existingReceivables = await prisma.receivable.count({
    where: { companyId, category: 'Faturamento 2025 (documento)' },
  });
  if (existingReceivables === 0) {
    for (const { month, amount } of faturamentoMensal2025) {
      const date = lastDayOfMonth(2025, month);
      await prisma.receivable.create({
        data: {
          companyId,
          clientId: null,
          description: `Faturamento agregado — ${String(month).padStart(2, '0')}/2025`,
          category: 'Faturamento 2025 (documento)',
          amount,
          dueDate: date,
          paidDate: date,
          status: 'PAGA',
          source: 'MANUAL',
        },
      });
    }
    console.log(`✔ ${faturamentoMensal2025.length} lançamentos de faturamento mensal 2025 criados.`);
  } else {
    console.log('✔ Faturamento mensal 2025 já lançado — nada a fazer.');
  }

  console.log(`✔ Seed de teste Gran Carnes concluído na empresa ${companyId}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
