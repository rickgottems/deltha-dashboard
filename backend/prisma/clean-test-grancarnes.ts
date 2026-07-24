// Remove TODOS os dados da empresa de teste "TESTE - Gran Carnes (dados reais)"
// (a mesma criada por npm run db:test:grancarnes), preservando as demais
// empresas cadastradas no banco multiempresa intactas, incluindo a Empresa
// Demo. Uso: npm run db:test:grancarnes:clean.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_EMAIL = 'teste.grancarnes@deltha.local';

async function main() {
  const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!user) {
    console.log('✔ Nenhuma empresa de teste Gran Carnes encontrada — nada para limpar.');
    return;
  }
  const companyId = user.companyId;

  const [receivables, balanceSheets, cashFlows] = await prisma.$transaction([
    prisma.receivable.deleteMany({ where: { companyId } }),
    prisma.balanceSheet.deleteMany({ where: { companyId } }),
    prisma.cashFlowStatement.deleteMany({ where: { companyId } }),
  ]);
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.company.delete({ where: { id: companyId } });

  console.log(
    `✔ Empresa de teste Gran Carnes removida: ${receivables.count} faturamentos, ` +
      `${balanceSheets.count} balanços, ${cashFlows.count} DFCs, usuário e empresa.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
