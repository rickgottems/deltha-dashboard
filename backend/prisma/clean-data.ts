// Remove TODOS os dados de negócio da "Empresa Demo" (a mesma criada por
// npm run db:demo), preservando as demais empresas cadastradas no banco
// multiempresa intactas. Uso: npm run db:clean.
//
// IMPORTANTE: limpar imported_documents junto é obrigatório — se ficasse
// para trás, uma reimportação futura da mesma pasta de NF-e veria as chaves
// de acesso como "já importadas" e nunca recriaria os dados que acabamos de
// apagar aqui.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@deltha.local';

async function main() {
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    console.log('✔ Nenhuma Empresa Demo encontrada — nada para limpar.');
    return;
  }
  const companyId = user.companyId;

  const [sales, tasks, receivables, expenses, products, clients, sellers, teams, goals, tokens, importedDocs] =
    await prisma.$transaction([
      prisma.sale.deleteMany({ where: { companyId } }),
      prisma.task.deleteMany({ where: { companyId } }),
      prisma.receivable.deleteMany({ where: { companyId } }),
      prisma.expense.deleteMany({ where: { companyId } }),
      prisma.product.deleteMany({ where: { companyId } }),
      prisma.client.deleteMany({ where: { companyId } }),
      prisma.seller.deleteMany({ where: { companyId } }),
      prisma.team.deleteMany({ where: { companyId } }),
      prisma.goal.deleteMany({ where: { companyId } }),
      prisma.integrationToken.deleteMany({ where: { companyId } }),
      prisma.importedDocument.deleteMany({ where: { companyId } }),
    ]);
  console.log(
    `✔ Dados de negócio removidos da Empresa Demo: ${sales.count} vendas, ${receivables.count} receitas, ` +
      `${expenses.count} despesas, ${products.count} produtos, ${clients.count} clientes, ` +
      `${sellers.count} vendedores, ${teams.count} equipes, ${tasks.count} tarefas, ` +
      `${goals.count} metas, ${tokens.count} tokens, ${importedDocs.count} registro(s) de importação.`
  );
  const thresholds = await prisma.alertThreshold.count({ where: { companyId } });
  console.log(`✔ Regras de alerta preservadas: ${thresholds} (configuração, editável na UI).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
