import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { importNfeFromDirectory } from '../src/services/nfeImport.js';

const dirArg = process.argv[2] ?? process.env.NFE_IMPORT_DIR;
const emailArg = process.argv[3] ?? process.env.NFE_IMPORT_COMPANY_EMAIL;
if (!dirArg || !emailArg) {
  console.error(
    'Uso: npm run import:nfe -- <pasta> <email-da-empresa>\n' +
      '(ou configure NFE_IMPORT_DIR e NFE_IMPORT_COMPANY_EMAIL no .env)\n' +
      'O e-mail identifica em qual empresa (login) os lançamentos importados entram.'
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { email: emailArg.toLowerCase() } });
if (!user) {
  console.error(`Nenhuma empresa encontrada com o e-mail de login "${emailArg}".`);
  process.exit(1);
}

const results = await importNfeFromDirectory(dirArg, user.companyId);
const resumo = results.reduce(
  (acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  },
  {} as Record<string, number>
);
console.log(`Importação concluída: ${JSON.stringify(resumo)}`);
for (const r of results.filter((x) => x.status === 'ERRO')) {
  console.error(`  ERRO em ${r.arquivo}: ${r.detalhe}`);
}
await prisma.$disconnect();
process.exit(0);
