import { useState } from 'react';
import { BadgeDollarSign, Percent, PiggyBank, Receipt } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { currentYm, fmtBRLCompact, fmtPct } from '../lib/format';
import { C } from '../lib/palette';
import { Card, ErrorState, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { MonthPicker } from '../components/pickers';
import { CashflowBars, ChartLegend, TimeSeriesLine, type LineSeriesDef } from '../components/charts';
import { AlertsPanel, type AlertItem } from '../components/AlertsPanel';

interface FinanceiroData {
  month: string;
  kpis: {
    receita: { value: number; varPct: number | null };
    despesas: { value: number; varPct: number | null };
    lucroLiquido: { value: number; varPct: number | null };
    margemLiquida: { value: number | null; varPp: number | null };
  };
  receitaXdespesa: { label: string; receita: number; despesa: number }[];
  lucroSerie: { label: string; lucro: number }[];
  fluxoCaixa: { label: string; valor: number }[];
  alerts: AlertItem[];
  hasData: boolean;
}

const RXD_SERIES: LineSeriesDef[] = [
  { key: 'receita', name: 'Receita', color: C.accent },
  { key: 'despesa', name: 'Despesa', color: C.silver },
];

const LUCRO_SERIES: LineSeriesDef[] = [{ key: 'lucro', name: 'Lucro Líquido', color: C.pos }];

export function Financeiro() {
  const [ym, setYm] = useState(currentYm());
  const { data, loading, error, reload } = useFetch<FinanceiroData>(`/api/financeiro?month=${ym}`);

  return (
    <>
      <PageHeader
        title="Dashboard Financeiro"
        subtitle="Receita, despesa, lucro e caixa"
        right={<MonthPicker ym={ym} onChange={setYm} />}
      />

      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Receita"
              icon={BadgeDollarSign}
              value={data.kpis.receita.value}
              formatter={fmtBRLCompact}
              delta={data.kpis.receita.varPct}
            />
            <KpiCard
              title="Despesas"
              icon={Receipt}
              value={data.kpis.despesas.value}
              formatter={fmtBRLCompact}
              delta={data.kpis.despesas.varPct}
              invertDelta
            />
            <KpiCard
              title="Lucro Líquido"
              icon={PiggyBank}
              value={data.kpis.lucroLiquido.value}
              formatter={fmtBRLCompact}
              delta={data.kpis.lucroLiquido.varPct}
            />
            <KpiCard
              title="Margem Líquida"
              icon={Percent}
              value={data.kpis.margemLiquida.value}
              formatter={(v) => fmtPct(v)}
              delta={data.kpis.margemLiquida.varPp}
              deltaSuffix=" p.p."
              emptyHint="Sem receita no mês"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card hover={false}>
              <SectionTitle right={<ChartLegend series={RXD_SERIES} />}>Receita x Despesa</SectionTitle>
              <TimeSeriesLine data={data.receitaXdespesa} series={RXD_SERIES} height={260} />
            </Card>
            <Card hover={false}>
              <SectionTitle>Evolução do Lucro Líquido</SectionTitle>
              <TimeSeriesLine data={data.lucroSerie} series={LUCRO_SERIES} height={260} />
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card hover={false}>
              <SectionTitle>Fluxo de Caixa Mensal (regime caixa)</SectionTitle>
              <CashflowBars data={data.fluxoCaixa} />
            </Card>
            <AlertsPanel alerts={data.alerts} />
          </div>
        </div>
      )}
    </>
  );
}
