import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Inbox, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { C } from '../lib/palette';

/* ---------- Card (borda 1px sutil, cantos arredondados, leve escala no hover) ---------- */

export function Card({
  children,
  className = '',
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <motion.div
      whileHover={hover ? { scale: 1.008 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`rounded-xl border border-line bg-panel p-4 ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mut">{children}</h2>
      {right}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-mut">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/* ---------- Variação % com seta na cor semântica ---------- */

export function Delta({
  value,
  suffix = '%',
  invert = false,
  label = 'vs mês anterior',
  digits = 1,
}: {
  value: number | null | undefined;
  suffix?: string;
  /** invert: subir é RUIM (ex.: despesas, % atrasado) */
  invert?: boolean;
  label?: string | null;
  digits?: number;
}) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-mut">— {label ?? ''}</span>;
  }
  const up = value >= 0;
  const good = invert ? !up : up;
  const color = good ? 'text-pos' : 'text-neg';
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}>
      <Icon size={12} strokeWidth={2.6} />
      {Math.abs(value).toLocaleString('pt-BR', { maximumFractionDigits: digits })}
      {suffix}
      {label && <span className="ml-1 font-normal text-mut">{label}</span>}
    </span>
  );
}

/* ---------- Badge / status dot ---------- */

export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-[0.08em]"
      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
    >
      {text}
    </span>
  );
}

/** Distingue lançamentos digitados na UI de lançamentos importados automaticamente (NF-e/Domínio). */
const SOURCE_LABEL: Record<string, string> = { MANUAL: 'MANUAL', NFE: 'NF-e', DOMINIO: 'Domínio' };

export function SourceBadge({ source }: { source: string }) {
  const isManual = source === 'MANUAL';
  return <Badge text={SOURCE_LABEL[source] ?? source} color={isManual ? C.mut : C.accent} />;
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: color, boxShadow: `0 0 8px ${color}88` }}
    />
  );
}

/* ---------- Barra de progresso (metas) ---------- */

export function ProgressBar({ pct, color = C.accent }: { pct: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel2">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        className="h-full rounded-full"
        style={{ background: color }}
      />
    </div>
  );
}

/* ---------- Estados vazios / loading / erro ---------- */

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Inbox className="text-mut" size={28} strokeWidth={1.5} />
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="max-w-md text-xs leading-relaxed text-mut">{hint}</p>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm text-neg">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-semibold text-accent hover:underline">
          Tentar novamente
        </button>
      )}
    </div>
  );
}

/* ---------- Botões ---------- */

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}) {
  const styles =
    variant === 'primary'
      ? 'bg-accent/15 text-accent border-accent/40 hover:bg-accent/25'
      : variant === 'danger'
        ? 'bg-neg/10 text-neg border-neg/40 hover:bg-neg/20'
        : 'bg-transparent text-mut border-line hover:text-ink hover:border-mut';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/* ---------- Modal ---------- */

export function Modal({
  title,
  open,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[90vh] w-full ${wide ? 'max-w-2xl' : 'max-w-md'} overflow-y-auto rounded-xl border border-line bg-panel2 p-5 shadow-2xl`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold">{title}</h3>
          <button onClick={onClose} className="text-mut transition-colors hover:text-ink">
            <X size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

/* ---------- Campos de formulário ---------- */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-mut">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-mut/60 focus:border-accent/60';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputCls} />;
}

/* ---------- Tabela ---------- */

export function Table({
  columns,
  children,
  align = [],
}: {
  columns: string[];
  children: ReactNode;
  align?: ('left' | 'right' | 'center')[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((col, i) => (
              <th
                key={col + i}
                className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-mut text-${align[i] ?? 'left'}`}
                style={{ textAlign: align[i] ?? 'left' }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-line/50 transition-colors last:border-0 hover:bg-panel2/60 ${onClick ? 'cursor-pointer' : ''}`}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  right = false,
  className = '',
}: {
  children: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return <td className={`px-3 py-2.5 ${right ? 'text-right tnum' : ''} ${className}`}>{children}</td>;
}
