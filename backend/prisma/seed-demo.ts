// ============================================================
// SEED DE DEMONSTRAÇÃO — OPCIONAL E EXPLÍCITO (npm run db:demo)
//
// Cria (ou reaproveita) uma empresa de teste dedicada — "Empresa Demo"
// (login demo@deltha.local / senha demo12345) — e popula 12 meses de dados
// fictícios coerentes SÓ dentro dela, para validar visualmente os
// dashboards sem tocar em nenhuma outra empresa cadastrada no banco
// multiempresa. Para limpar: npm run db:clean (apaga só a Empresa Demo).
//
// Nenhum componente do frontend contém dados embutidos — tudo que os
// dashboards exibem passa pela API e pelo banco, com ou sem este seed.
// ============================================================

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@deltha.local';
const DEMO_PASSWORD = 'demo12345';

// Gerador pseudo-aleatório determinístico (reproduzível)
let rngState = 42;
function rnd(): number {
  rngState = (rngState * 1103515245 + 12345) % 2147483648;
  return rngState / 2147483648;
}
const between = (min: number, max: number) => min + rnd() * (max - min);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

const now = new Date();
const Y = now.getUTCFullYear();
const M = now.getUTCMonth(); // mês atual (0-based)

/** Data UTC no mês (offset em meses relativo ao atual) e dia informado. */
const dateIn = (monthOffset: number, day: number) => new Date(Date.UTC(Y, M + monthOffset, day));

async function main() {
  let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, include: { company: true } });
  if (!user) {
    const company = await prisma.company.create({ data: { name: 'Empresa Demo', accountType: 'EXTERNO' } });
    user = await prisma.user.create({
      data: {
        companyId: company.id,
        email: DEMO_EMAIL,
        name: 'Usuário Demo',
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      },
      include: { company: true },
    });
    console.log(`✔ Empresa Demo criada. Login: ${DEMO_EMAIL} / senha: ${DEMO_PASSWORD}`);
  }
  const companyId = user.companyId;

  const counts = await Promise.all([
    prisma.client.count({ where: { companyId } }),
    prisma.sale.count({ where: { companyId } }),
    prisma.expense.count({ where: { companyId } }),
  ]);
  if (counts.some((c) => c > 0)) {
    console.error('✖ A Empresa Demo já contém dados. Rode "npm run db:clean" antes de "npm run db:demo".');
    process.exit(1);
  }

  /* ---------- Cadastros ---------- */
  const clientsData = [
    { name: 'Aurora Comércio Ltda', email: 'financeiro@auroracomercio.com.br', profile: 'bom' },
    { name: 'Vetor Engenharia', email: 'contas@vetoreng.com.br', profile: 'bom' },
    { name: 'Mercado Bonfim', email: 'compras@mercadobonfim.com.br', profile: 'medio' },
    { name: 'TechNova Sistemas', email: 'ap@technova.com.br', profile: 'bom' },
    { name: 'Distribuidora Salles', email: 'pagamentos@dsalles.com.br', profile: 'ruim' },
    { name: 'Colégio Horizonte', email: 'adm@colegiohorizonte.com.br', profile: 'medio' },
    { name: 'Padaria Pão Nosso', email: 'paonosso@gmail.com', profile: 'ruim' },
    { name: 'Clínica Vitalis', email: 'financeiro@vitalis.med.br', profile: 'bom' },
  ];
  const clients = [] as { id: string; profile: string }[];
  for (const [i, c] of clientsData.entries()) {
    const created = await prisma.client.create({
      data: { companyId, name: c.name, email: c.email, createdAt: dateIn(-11 + Math.floor(i * 1.4), 5 + i) },
    });
    clients.push({ id: created.id, profile: c.profile });
  }
  // Novos clientes recentes (para o KPI do Executivo)
  for (let i = 0; i < 3; i++) {
    const created = await prisma.client.create({
      data: {
        companyId,
        name: ['Estúdio Kraft', 'AgroCampo Insumos', 'Óptica Lumen'][i],
        email: ['contato@kraft.st', 'compras@agrocampo.agr.br', 'lumen@optica.com.br'][i],
        createdAt: dateIn(0, 2 + i * 3),
      },
    });
    clients.push({ id: created.id, profile: 'bom' });
  }

  const productsData = [
    { name: 'Plano Essencial (mensal)', costPrice: 90, salePrice: 249 },
    { name: 'Plano Profissional (mensal)', costPrice: 180, salePrice: 549 },
    { name: 'Consultoria de Implantação', costPrice: 1400, salePrice: 3200 },
    { name: 'Treinamento In Company', costPrice: 800, salePrice: 1900 },
    { name: 'Licença Módulo Fiscal', costPrice: 110, salePrice: 199 },
    { name: 'Suporte Premium (mensal)', costPrice: 60, salePrice: 149 },
  ];
  const products = [];
  for (const p of productsData) products.push(await prisma.product.create({ data: { ...p, companyId } }));

  const sellers = [];
  for (const name of ['Lucas Lima', 'Ana Oliveira', 'Rafael Souza']) {
    sellers.push(await prisma.seller.create({ data: { name, companyId } }));
  }

  const teams = [];
  for (const name of ['Equipe Alpha', 'Equipe Beta', 'Equipe Gama', 'Equipe Delta']) {
    teams.push(await prisma.team.create({ data: { name, companyId } }));
  }

  /* ---------- 12 meses de movimento ---------- */
  const delayReasons = [
    'Aprovação do cliente',
    'Dependência interna',
    'Revisão técnica',
    'Falta de insumos',
    'Retrabalho',
  ];

  for (let off = -11; off <= 0; off++) {
    const growth = 1 + (off + 11) * 0.045; // crescimento suave ao longo do ano
    const isCurrent = off === 0;

    /* Receitas (contas a receber) — categoria + cliente + status de cobrança */
    const nReceivables = 9 + Math.floor(rnd() * 4);
    for (let i = 0; i < nReceivables; i++) {
      const client = pick(clients);
      const category = pick(['Assinaturas', 'Serviços', 'Licenças', 'Consultoria']);
      const amount = Math.round(between(1800, 9500) * growth);
      const day = 3 + Math.floor(rnd() * 24);
      const dueDate = dateIn(off, day);

      // Comportamento de pagamento coerente com o perfil do cliente
      let paidDate: Date | null = null;
      let status = 'PENDENTE';
      const roll = rnd();
      if (client.profile === 'bom') {
        if (!isCurrent || roll < 0.7) {
          paidDate = new Date(dueDate.getTime() + Math.floor(between(-3, 2)) * 86400000);
          status = 'PAGA';
        }
      } else if (client.profile === 'medio') {
        if (!isCurrent || roll < 0.6) {
          paidDate = new Date(dueDate.getTime() + Math.floor(between(0, 12)) * 86400000);
          status = 'PAGA';
        }
      } else {
        // mau pagador: parte paga com muito atraso, parte fica em aberto
        if (roll < 0.55) {
          paidDate = new Date(dueDate.getTime() + Math.floor(between(8, 35)) * 86400000);
          status = 'PAGA';
        } else if (dueDate.getTime() < Date.now()) {
          status = 'ATRASADA';
        }
      }
      if (status !== 'PAGA' && !paidDate && dueDate.getTime() < Date.now()) status = 'ATRASADA';

      await prisma.receivable.create({
        data: {
          companyId,
          clientId: clients.indexOf(client) % 5 === 4 && rnd() < 0.15 ? null : client.id,
          description: `${category} — ref. ${String(dueDate.getUTCMonth() + 1).padStart(2, '0')}/${dueDate.getUTCFullYear()}`,
          category,
          amount,
          dueDate,
          paidDate: status === 'PAGA' ? paidDate : null,
          status,
        },
      });
    }

    /* Despesas — categorias com classificação DRE */
    const receitaEstimada = 9 * 5200 * growth;
    const expensePlan: { category: string; kind: string; base: number; jitter: number }[] = [
      { category: 'Impostos sobre receita', kind: 'DEDUCAO', base: receitaEstimada * 0.09, jitter: 0.05 },
      { category: 'Fornecedores / CMV', kind: 'CUSTO', base: receitaEstimada * 0.24, jitter: 0.15 },
      { category: 'Folha de pagamento', kind: 'OPERACIONAL', base: receitaEstimada * 0.27, jitter: 0.04 },
      { category: 'Aluguel e condomínio', kind: 'OPERACIONAL', base: 4200, jitter: 0.01 },
      { category: 'Marketing', kind: 'OPERACIONAL', base: receitaEstimada * 0.06, jitter: 0.3 },
      { category: 'Software e ferramentas', kind: 'OPERACIONAL', base: 1900, jitter: 0.1 },
      { category: 'Depreciação', kind: 'DEPRECIACAO', base: 1500, jitter: 0 },
      { category: 'Juros e tarifas bancárias', kind: 'FINANCEIRA', base: 900, jitter: 0.35 },
      { category: 'Despesas diversas', kind: 'OUTRA', base: 1100, jitter: 0.5 },
    ];
    for (const e of expensePlan) {
      const amount = Math.round(e.base * (1 + between(-e.jitter, e.jitter)));
      await prisma.expense.create({
        data: {
          companyId,
          category: e.category,
          kind: e.kind,
          description: null,
          amount,
          date: dateIn(off, 5 + Math.floor(rnd() * 20)),
        },
      });
    }
    // Despesa atípica no mês atual (aciona insight de anomalia)
    if (isCurrent) {
      await prisma.expense.create({
        data: {
          companyId,
          category: 'Serviços de terceiros',
          kind: 'OPERACIONAL',
          description: 'Consultoria jurídica pontual',
          amount: 7800,
          date: dateIn(0, 12),
        },
      });
    } else if (off >= -6) {
      await prisma.expense.create({
        data: {
          companyId,
          category: 'Serviços de terceiros',
          kind: 'OPERACIONAL',
          amount: Math.round(between(2100, 2900)),
          date: dateIn(off, 10),
        },
      });
    }

    /* Vendas */
    const nSales = 14 + Math.floor(rnd() * 8 * growth);
    for (let i = 0; i < nSales; i++) {
      const product = pick(products);
      const quantity = product.name.includes('Plano') ? 1 + Math.floor(rnd() * 3) : 1;
      await prisma.sale.create({
        data: {
          companyId,
          productId: product.id,
          clientId: pick(clients).id,
          sellerId: pick(sellers).id,
          quantity,
          amount: Math.round(product.salePrice * quantity * between(0.95, 1.05)),
          date: dateIn(off, 1 + Math.floor(rnd() * 27)),
        },
      });
    }

    /* Tarefas operacionais */
    const nTasks = 10 + Math.floor(rnd() * 6);
    for (let i = 0; i < nTasks; i++) {
      const team = pick(teams);
      const day = 2 + Math.floor(rnd() * 25);
      const dueDate = dateIn(off, day);
      const createdAt = new Date(dueDate.getTime() - Math.floor(between(3, 14)) * 86400000);
      const late = rnd() < (team.name.includes('Delta') ? 0.42 : 0.2);
      let deliveredDate: Date | null = null;
      let status = 'EM_ANDAMENTO';
      let delayReason: string | null = null;
      if (!isCurrent || rnd() < 0.7) {
        deliveredDate = new Date(dueDate.getTime() + (late ? Math.floor(between(1, 9)) : -Math.floor(between(0, 3))) * 86400000);
        status = 'CONCLUIDA';
        if (late) delayReason = pick(delayReasons);
      } else if (dueDate.getTime() < Date.now() && late) {
        delayReason = pick(delayReasons);
      }
      await prisma.task.create({
        data: {
          companyId,
          teamId: team.id,
          title: `${pick(['Entrega', 'Implantação', 'Revisão', 'Atendimento', 'Manutenção'])} #${String(i + 1).padStart(2, '0')}`,
          dueDate,
          deliveredDate,
          status,
          delayReason,
          createdAt,
        },
      });
    }
  }

  /* Metas padrão (editáveis em Configurações → Metas) */
  const goals = [
    { metricKey: 'receita_total', period: 'default', value: 60000 },
    { metricKey: 'faturamento_vendas', period: 'default', value: 24000 },
    { metricKey: 'novos_clientes', period: 'default', value: 3 },
    { metricKey: 'lucro_liquido', period: 'default', value: 12000 },
  ];
  for (const g of goals) {
    await prisma.goal.upsert({
      where: { companyId_metricKey_period: { companyId, metricKey: g.metricKey, period: g.period } },
      create: { ...g, companyId },
      update: {},
    });
  }

  console.log(`✔ Dados de DEMONSTRAÇÃO criados (12 meses) na Empresa Demo (${DEMO_EMAIL}). Para limpar: npm run db:clean`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
