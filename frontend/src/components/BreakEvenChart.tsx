// Ponto de Equilíbrio: Despesas Fixas ÷ Margem de Contribuição (ver backend
// src/services/finance.ts → breakEven). Visualização em barra de progresso
// (não radar/área) — é uma comparação de 1 valor atual contra 1 limiar, uma
// barra comunica isso mais claro que uma forma geométrica multi-eixo, e
// reaproveita o mesmo padrão visual do <ProgressBar> já usado no resto do
// app em vez de introduzir um terceiro estilo de gráfico.

import { motion } from 'framer-motion';
import { fmtBRL, fmtPct } from '../lib/format';
import { C } from '../lib/palette';
import { Card, EmptyState, SectionTitle } from './ui';

export interface BreakEvenData {
  status: 'OK' | 'SEM_DESPESA_FIXA' | 'SEM_MARGEM_CONTRIBUICAO' | 'MARGEM_NAO_POSITIVA';
  margemContribuicaoPct: number | null;
  despesasFixas: number;
  receitaLiquida: number;
  pontoEquilibrio: number | null;
  distanciaPontoEquilibrio: number | null;
}

const EMPTY_STATE_COPY: Record<Exclude<BreakEvenData['status'], 'OK'>, { title: string; hint: string }> = {
  SEM_DESPESA_FIXA: {
    title: 'Aguardando lançamento de despesas fixas',
    hint: 'Classifique ao menos uma despesa do período como "Fixo" na aba Despesas para calcular o ponto de equilíbrio.',
  },
  SEM_MARGEM_CONTRIBUICAO: {
    title: 'Nenhum produto com margem de contribuição válida',
    hint: 'Cadastre preço de custo e preço de venda dos produtos ativos em Configurações → Produtos.',
  },
  MARGEM_NAO_POSITIVA: {
    title: 'Margem de contribuição não é positiva',
    hint: 'Com o preço de custo atual dos produtos, cada venda adicional não cobre nem o próprio custo variável — revise preços em Configurações → Produtos antes de calcular o equilíbrio.',
  },
};

export function BreakEvenChart({ data }: { data: BreakEvenData }) {
  if (data.status !== 'OK' || data.pontoEquilibrio === null) {
    const copy = EMPTY_STATE_COPY[data.status === 'OK' ? 'SEM_DESPESA_FIXA' : data.status];
    return (
      <Card hover={false}>
        <SectionTitle>Ponto de Equilíbrio</SectionTitle>
        <EmptyState title={copy.title} hint={copy.hint} />
      </Card>
    );
  }

  const { pontoEquilibrio, receitaLiquida, despesasFixas, margemContribuicaoPct, distanciaPontoEquilibrio } = data;
  const acimaDoEquilibrio = receitaLiquida >= pontoEquilibrio;
  const max = Math.max(pontoEquilibrio, receitaLiquida) * 1.15 || 1;
  const pctReceita = Math.min(100, (receitaLiquida / max) * 100);
  const pctMarcador = Math.min(100, (pontoEquilibrio / max) * 100);
  const barColor = acimaDoEquilibrio ? C.pos : C.warn;

  return (
    <Card hover={false}>
      <SectionTitle>Ponto de Equilíbrio</SectionTitle>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-mut">Receita líquida</p>
          <p className="tnum text-lg font-bold">{fmtBRL(receitaLiquida)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-mut">Ponto de equilíbrio</p>
          <p className="tnum text-lg font-bold">{fmtBRL(pontoEquilibrio)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-mut">Despesas fixas</p>
          <p className="tnum text-lg font-bold">{fmtBRL(despesasFixas)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-mut">Margem de contribuição</p>
          <p className="tnum text-lg font-bold">{margemContribuicaoPct !== null ? fmtPct(margemContribuicaoPct, 1) : '—'}</p>
        </div>
      </div>

      <div className="relative h-4 w-full overflow-hidden rounded-full bg-panel2">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pctReceita}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: barColor }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-ink/70"
          style={{ left: `${pctMarcador}%` }}
          title="Ponto de equilíbrio"
        />
      </div>

      <p className="mt-3 text-xs" style={{ color: barColor }}>
        {acimaDoEquilibrio
          ? `${fmtBRL(Math.abs(distanciaPontoEquilibrio ?? 0))} acima do ponto de equilíbrio — operação lucrativa no período.`
          : `Faltam ${fmtBRL(Math.abs(distanciaPontoEquilibrio ?? 0))} de receita para cobrir os custos fixos do período.`}
      </p>
    </Card>
  );
}
