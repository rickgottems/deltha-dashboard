import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCountUp } from '../hooks/useCountUp';
import { Card, Delta, ProgressBar } from './ui';
import { Sparkline } from './charts';
import { C } from '../lib/palette';

/**
 * Card de KPI padrão: título com ícone, número grande com contagem
 * crescente, variação % com seta semântica, sparkline em linha e
 * barra de meta opcional.
 */
export function KpiCard({
  title,
  icon: Icon,
  value,
  formatter,
  delta,
  deltaSuffix = '%',
  deltaLabel = 'vs mês anterior',
  invertDelta = false,
  spark,
  sparkColor = C.accent,
  meta,
  footer,
  emptyHint = 'Sem dados',
}: {
  title: string;
  icon?: LucideIcon;
  value: number | null | undefined;
  formatter: (v: number) => string;
  delta?: number | null;
  deltaSuffix?: string;
  deltaLabel?: string;
  invertDelta?: boolean;
  spark?: { value: number }[];
  sparkColor?: string;
  meta?: { label: string; pct: number } | null;
  footer?: ReactNode;
  emptyHint?: string;
}) {
  const animated = useCountUp(value ?? 0);
  const hasValue = value !== null && value !== undefined;

  const metaColor = meta ? (meta.pct >= 100 ? C.pos : meta.pct >= 70 ? C.accent : C.neg) : C.accent;

  return (
    <Card className="flex min-h-[132px] flex-col justify-between gap-2">
      <div className="flex items-center gap-2">
        {Icon && (
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/12 text-accent">
            <Icon size={13} strokeWidth={2.4} />
          </span>
        )}
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mut">{title}</span>
      </div>

      <div>
        <div className="tnum text-[26px] font-extrabold leading-tight">
          {hasValue ? formatter(animated) : <span className="text-lg font-semibold text-mut">{emptyHint}</span>}
        </div>
        {delta !== undefined && (
          <div className="mt-0.5">
            <Delta value={delta} suffix={deltaSuffix} invert={invertDelta} label={deltaLabel} />
          </div>
        )}
      </div>

      {spark && spark.length > 1 && <Sparkline data={spark} color={sparkColor} />}

      {meta && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] text-mut">
            <span>{meta.label}</span>
            <span className="tnum font-bold" style={{ color: metaColor }}>
              {Math.round(meta.pct)}%
            </span>
          </div>
          <ProgressBar pct={meta.pct} color={metaColor} />
        </div>
      )}

      {footer}
    </Card>
  );
}
