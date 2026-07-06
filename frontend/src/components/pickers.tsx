import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addMonths, currentYm, fmtYm, todayISO } from '../lib/format';

/* ---------- Seletor de mês (Executivo, Financeiro, Vendas, Operações) ---------- */

export function MonthPicker({ ym, onChange }: { ym: string; onChange: (ym: string) => void }) {
  const isCurrent = ym >= currentYm();
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-panel px-1.5 py-1">
      <button
        onClick={() => onChange(addMonths(ym, -1))}
        className="rounded-md p-1 text-mut transition-colors hover:bg-panel2 hover:text-ink"
        aria-label="Mês anterior"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="min-w-[130px] text-center text-xs font-semibold capitalize">{fmtYm(ym)}</span>
      <button
        onClick={() => onChange(addMonths(ym, 1))}
        disabled={isCurrent}
        className="rounded-md p-1 text-mut transition-colors hover:bg-panel2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
        aria-label="Próximo mês"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

/* ---------- Filtro de período com atalhos (Receitas, Despesas, Relatórios) ---------- */

export interface PeriodValue {
  from: string; // YYYY-MM-DD
  to: string;
}

type Preset = 'mes' | 'mes_anterior' | 'trimestre' | 'custom';

function presetRange(preset: Exclude<Preset, 'custom'>): PeriodValue {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === 'mes') {
    return { from: iso(new Date(Date.UTC(y, m, 1))), to: todayISO() };
  }
  if (preset === 'mes_anterior') {
    return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
  }
  // trimestre: últimos 3 meses (mês atual + 2 anteriores)
  return { from: iso(new Date(Date.UTC(y, m - 2, 1))), to: todayISO() };
}

export function usePeriod(initial: Exclude<Preset, 'custom'> = 'mes') {
  const [preset, setPreset] = useState<Preset>(initial);
  const [custom, setCustom] = useState<PeriodValue>(presetRange(initial));
  const value = useMemo<PeriodValue>(
    () => (preset === 'custom' ? custom : presetRange(preset)),
    [preset, custom]
  );
  return { preset, setPreset, custom, setCustom, value };
}

export function PeriodPicker({
  preset,
  setPreset,
  custom,
  setCustom,
}: ReturnType<typeof usePeriod>) {
  const presets: { key: Preset; label: string }[] = [
    { key: 'mes', label: 'Este mês' },
    { key: 'mes_anterior', label: 'Mês anterior' },
    { key: 'trimestre', label: 'Trimestre' },
    { key: 'custom', label: 'Personalizado' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-line">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
              preset === p.key ? 'bg-accent/15 text-accent' : 'bg-panel text-mut hover:text-ink'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-1.5 text-xs">
          <input
            type="date"
            value={custom.from}
            onChange={(e) => setCustom({ ...custom, from: e.target.value })}
            className="rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/60"
          />
          <span className="text-mut">até</span>
          <input
            type="date"
            value={custom.to}
            onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            className="rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/60"
          />
        </div>
      )}
    </div>
  );
}
