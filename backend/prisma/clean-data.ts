// Remove TODOS os dados de negócio (clientes, receitas, despesas, produtos,
// vendas, vendedores, equipes, tarefas, metas, tokens de integração e o
// histórico de importações NF-e/Domínio), preservando o schema, as migrations
// e as regras de alerta (configuração).
// Uso: npm run db:clean  — útil para limpar os dados de demonstração
// (npm run db:demo) antes de começar a operar com dados reais.
//
// IMPORTANTE: limpar imported_documents junto é obrigatório — se ficasse
// para trás, uma reimportação futura da mesma pasta de NF-e veria as chaves
// de acesso como "já importadas" e nunca recriaria os dados que acabamos de
// apagar aqui.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [sales, tasks, receivables, expenses, products, clients, sellers, teams, goals, tokens, importedDocs] =
    await prisma.$transaction([
      prisma.sale.deleteMany(),
      prisma.task.deleteMany(),
      prisma.receivable.deleteMany(),
      prisma.expense.deleteMany(),
      prisma.product.deleteMany(),
      prisma.client.deleteMany(),
      prisma.seller.deleteMany(),
      prisma.team.deleteMany(),
      prisma.goal.deleteMany(),
      prisma.integrationToken.deleteMany(),
      prisma.importedDocument.deleteMany(),
    ]);
  console.log(
    `✔ Dados de negócio removidos: ${sales.count} vendas, ${receivables.count} receitas, ` +
      `${expenses.count} despesas, ${products.count} produtos, ${clients.count} clientes, ` +
      `${sellers.count} vendedores, ${teams.count} equipes, ${tasks.count} tarefas, ` +
      `${goals.count} metas, ${tokens.count} tokens, ${importedDocs.count} registro(s) de importação.`
  );
  const thresholds = await prisma.alertThreshold.count();
  console.log(`✔ Regras de alerta preservadas: ${thresholds} (configuração, editável na UI).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
