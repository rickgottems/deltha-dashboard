import { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { Button, Card, PageHeader, SectionTitle } from '../components/ui';
import { PeriodPicker, usePeriod } from '../components/pickers';

const TABS = [
  { key: 'executivo', label: 'Executivo', desc: 'DRE gerencial mês a mês (receita, custos, EBITDA, margens, caixa)' },
  { key: 'financeiro', label: 'Financeiro', desc: 'DRE gerencial mês a mês (idem Executivo)' },
  { key: 'receitas', label: 'Receitas', desc: 'Receitas por categoria + todos os lançamentos do período' },
  { key: 'despesas', label: 'Despesas', desc: 'Despesas por categoria + lançamentos com classificação DRE' },
  { key: 'vendas', label: 'Vendas', desc: 'Produtos mais vendidos + vendas detalhadas do período' },
  { key: 'clientes', label: 'Clientes', desc: 'Base completa com total comprado e risco de inadimplência' },
  { key: 'operacoes', label: 'Operações', desc: 'Tarefas do período com prazos, entregas e motivos de atraso' },
];

export function Relatorios() {
  const period = usePeriod();
  const [tab, setTab] = useState('executivo');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (format: 'pdf' | 'xlsx') => {
    setDownloading(format);
    setError(null);
    try {
      const url = `/api/relatorios/export?tab=${tab}&from=${period.value.from}&to=${period.value.to}&format=${format}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Falha na exportação (${res.status})`);
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `relatorio-${tab}-${period.value.from}-a-${period.value.to}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <PageHeader title="Relatórios" subtitle="Exportação em PDF e Excel, por aba e por período" />

      <div className="space-y-4">
        <Card hover={false}>
          <SectionTitle>1 · Escolha a aba</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  tab === t.key ? 'border-accent/50 bg-accent/8' : 'border-line bg-panel2/30 hover:border-mut/50'
                }`}
              >
                <p className={`text-[13px] font-bold ${tab === t.key ? 'text-accent' : ''}`}>{t.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-mut">{t.desc}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card hover={false}>
          <SectionTitle>2 · Escolha o período</SectionTitle>
          <PeriodPicker {...period} />
          <p className="mt-2 text-[11px] text-mut">
            Para os relatórios Executivo/Financeiro o período é agregado por mês (máx. 24 meses).
          </p>
        </Card>

        <Card hover={false}>
          <SectionTitle>3 · Exporte</SectionTitle>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => download('pdf')} disabled={downloading !== null}>
              <span className="inline-flex items-center gap-2">
                <FileText size={14} />
                {downloading === 'pdf' ? 'Gerando PDF…' : 'Baixar PDF'}
              </span>
            </Button>
            <Button onClick={() => download('xlsx')} disabled={downloading !== null}>
              <span className="inline-flex items-center gap-2">
                <FileSpreadsheet size={14} />
                {downloading === 'xlsx' ? 'Gerando Excel…' : 'Baixar Excel (.xlsx)'}
              </span>
            </Button>
            {error && <span className="text-xs text-neg">{error}</span>}
          </div>
        </Card>
      </div>
    </>
  );
}
