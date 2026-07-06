import 'dotenv/config';
import { importNfeFromDirectory } from '../src/services/nfeImport.js';

const dirArg = process.argv[2] ?? process.env.NFE_IMPORT_DIR;
if (!dirArg) {
  console.error('Uso: npm run import:nfe -- <pasta> (ou configure NFE_IMPORT_DIR no .env)');
  process.exit(1);
}

const results = await importNfeFromDirectory(dirArg);
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
process.exit(0);
