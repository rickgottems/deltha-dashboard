// Componentes de gráfico padronizados (Recharts) — séries temporais SEMPRE
// em linha (requisito do cliente); barras apenas para fluxo de caixa,
// waterfall e rankings horizontais.

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { C } from '../lib/palette';

const tooltipStyle = {
  background: C.panel2,
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  fontSize: 12,
  color: C.ink,
} as const;

const axisTick = { fill: C.mut, fontSize: 11 } as const;

export const compactBRL = (v: number): string => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}K`;
  return `${sign}R$ ${abs.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
};

const fullBRL = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/* ---------- Sparkline (KPIs) ---------- */

export function Sparkline({ data, color = C.accent }: { data: { value: number }[]; color?: string }) {
  return (
    <div className="h-9 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.8}
            dot={false}
            isAnimationActive
            animationDuration={1100}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Série temporal em linha (multi-séries, eixo direito opcional) ---------- */

export interface LineSeriesDef {
  key: string;
  name: string;
  color: string;
  dashed?: boolean;
  rightAxis?: boolean;
}

export function TimeSeriesLine({
  data,
  series,
  height = 280,
  money = true,
  rightAxisSuffix = '%',
}: {
  data: Record<string, unknown>[];
  series: LineSeriesDef[];
  height?: number;
  money?: boolean;
  rightAxisSuffix?: string;
}) {
  const hasRight = series.some((s) => s.rightAxis);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: hasRight ? 4 : 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 6" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={58}
            tickFormatter={(v: number) => (money ? compactBRL(v) : String(v))}
          />
          {hasRight && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(v: number) => `${v.toFixed(0)}${rightAxisSuffix}`}
            />
          )}
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number, name: string) => {
              const def = series.find((s) => s.name === name);
              if (def?.rightAxis) return [`${Number(value).toFixed(1)}${rightAxisSuffix}`, name];
              return [money ? fullBRL(Number(value)) : Number(value).toLocaleString('pt-BR'), name];
            }}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              yAxisId={s.rightAxis ? 'right' : undefined}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '5 4' : undefined}
              dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive
              animationDuration={1100}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({ series }: { series: LineSeriesDef[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-mut">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/* ---------- Waterfall (Resultado do período) ---------- */

export interface WaterfallStep {
  name: string;
  value: number;
  kind: 'total' | 'increase' | 'decrease';
}

export function WaterfallChart({ steps, height = 300 }: { steps: WaterfallStep[]; height?: number }) {
  let running = 0;
  const data = steps.map((s) => {
    if (s.kind === 'total') {
      running = s.value;
      return {
        name: s.name,
        base: Math.min(0, s.value),
        size: Math.abs(s.value),
        real: s.value,
        // Barras de subtotal usam um tom neutro (prata), não o accent —
        // o accent da marca agora é carmim e ficaria ambíguo ao lado das
        // barras "decrease" (também vermelhas, C.neg).
        color: s.value >= 0 ? C.silver : C.neg,
      };
    }
    const prev = running;
    running = prev + s.value;
    return {
      name: s.name,
      base: Math.min(prev, running),
      size: Math.abs(s.value),
      real: s.value,
      color: s.value >= 0 ? C.pos : C.neg,
    };
  });

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 6" vertical={false} />
          <XAxis dataKey="name" tick={{ ...axisTick, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={58}
            tickFormatter={(v: number) => compactBRL(v)}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(_v: number, _n: string, entry: { payload?: { real?: number } }) => [
              fullBRL(entry.payload?.real ?? 0),
              'Valor',
            ]}
          />
          <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="size" stackId="wf" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} fillOpacity={0.85} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Fluxo de caixa mensal (barras verde/vermelho) ---------- */

export function CashflowBars({ data, height = 260 }: { data: { label: string; valor: number }[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 6" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={58}
            tickFormatter={(v: number) => compactBRL(v)}
          />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fullBRL(Number(v)), 'Fluxo de caixa']} />
          <Bar dataKey="valor" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.valor >= 0 ? C.pos : C.neg} fillOpacity={0.85} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Barras horizontais (gargalos, produtividade por equipe) ---------- */

export function HBars({
  data,
  color = C.accent,
  height,
  suffix = '',
  colorByValue,
}: {
  data: { name: string; value: number }[];
  color?: string;
  height?: number;
  suffix?: string;
  /** opcional: retorna cor por item (ex.: produtividade semafórica) */
  colorByValue?: (value: number) => string;
}) {
  const h = height ?? Math.max(140, data.length * 42 + 30);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 6" horizontal={false} />
          <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ ...axisTick, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={150}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: number) => [`${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${suffix}`, '']}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive animationDuration={900}>
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v: number) => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}${suffix}`}
              style={{ fill: C.ink, fontSize: 11, fontWeight: 600 }}
            />
            {data.map((d, i) => (
              <Cell key={i} fill={colorByValue ? colorByValue(d.value) : color} fillOpacity={0.85} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
