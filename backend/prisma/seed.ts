// Seed de CONFIGURAÇÃO (não é dado de negócio): limiares de alerta padrão.
// São apenas valores iniciais — tudo editável em Configurações → Alertas.
// Roda automaticamente no `prisma migrate reset` e via `npm run db:seed`.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_THRESHOLDS = [
  // direction BELOW → dispara quando o valor cai abaixo do limiar
  { metricKey: 'margem_liquida', label: 'Margem Líquida', unit: '%', yellowThreshold: 15, redThreshold: 10, direction: 'BELOW', scope: 'ambos' },
  { metricKey: 'margem_ebitda', label: 'Margem EBITDA', unit: '%', yellowThreshold: 20, redThreshold: 10, direction: 'BELOW', scope: 'executivo' },
  { metricKey: 'atingimento_meta_receita', label: 'Atingimento da meta de receita', unit: '%', yellowThreshold: 90, redThreshold: 70, direction: 'BELOW', scope: 'executivo' },
  { metricKey: 'fluxo_caixa', label: 'Fluxo de Caixa do mês', unit: 'R$', yellowThreshold: 5000, redThreshold: 0, direction: 'BELOW', scope: 'financeiro' },
  // direction ABOVE → dispara quando o valor sobe acima do limiar
  { metricKey: 'inadimplencia', label: 'Inadimplência', unit: '%', yellowThreshold: 3, redThreshold: 7, direction: 'ABOVE', scope: 'ambos' },
  { metricKey: 'comprometimento_receita', label: 'Despesas ÷ Receita', unit: '%', yellowThreshold: 80, redThreshold: 95, direction: 'ABOVE', scope: 'financeiro' },
];

async function main() {
  for (const t of DEFAULT_THRESHOLDS) {
    await prisma.alertThreshold.upsert({
      where: { metricKey: t.metricKey },
      create: t,
      update: {}, // não sobrescreve ajustes feitos pelo usuário na UI
    });
  }
  console.log(`✔ Seed de configuração: ${DEFAULT_THRESHOLDS.length} regras de alerta padrão garantidas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
