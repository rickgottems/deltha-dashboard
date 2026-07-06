import { Lightbulb, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, EmptyState, SectionTitle } from './ui';
import { C } from '../lib/palette';

export interface InsightItem {
  tone: 'positivo' | 'negativo' | 'neutro';
  title: string;
  text: string;
  action: string | null;
}

const TONE = {
  positivo: { color: C.pos, Icon: TrendingUp },
  negativo: { color: C.neg, Icon: TrendingDown },
  neutro: { color: C.mut, Icon: Lightbulb },
} as const;

/** Leitura automática dos números. Insight negativo sempre traz "Ação recomendada". */
export function InsightsPanel({ insights }: { insights: InsightItem[] }) {
  return (
    <Card hover={false}>
      <SectionTitle>Insights</SectionTitle>
      {insights.length === 0 ? (
        <EmptyState
          title="Sem insights para o período"
          hint="Os insights são gerados automaticamente a partir dos lançamentos de receitas, despesas e metas."
        />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {insights.map((ins, i) => {
            const { color, Icon } = TONE[ins.tone];
            return (
              <div key={i} className="rounded-lg border border-line bg-panel2/40 p-3.5">
                <div className="flex items-center gap-2">
                  <Icon size={15} style={{ color }} />
                  <span className="text-[13px] font-semibold">{ins.title}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-mut">{ins.text}</p>
                {ins.action && (
                  <p className="mt-2 rounded-md border border-accent/25 bg-accent/8 px-2.5 py-2 text-xs leading-relaxed">
                    <span className="font-bold text-accent">Ação recomendada: </span>
                    <span className="text-ink/90">{ins.action}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
