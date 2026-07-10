// Seed de configuração GLOBAL não existe mais desde a migração multiempresa:
// cada empresa nova já nasce com seus próprios limiares de alerta padrão,
// criados na hora do cadastro (ver DEFAULT_THRESHOLDS em src/routes/auth.ts,
// dentro de POST /api/auth/register). Este arquivo fica só como no-op para
// não quebrar `prisma migrate reset` (que chama "prisma.seed" do package.json).

async function main() {
  console.log('✔ Nenhum seed global necessário — limiares de alerta são criados por empresa no cadastro (routes/auth.ts).');
}

main();
