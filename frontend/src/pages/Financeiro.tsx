import { BadgeDollarSign, Percent, PiggyBank, Receipt, TrendingUp, UserX, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { fmtBRLCompact, fmtPct } from '../lib/format';
import { C } from '../lib/palette';
import { Card, ErrorState, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { FinanceFilterBar, useFinanceFilter } from '../components/pickers';
import { CashflowBars, ChartLegend, TimeSeriesLine, type LineSeriesDef } from '../components/charts';
import { AlertsPanel, type AlertItem } from '../components/AlertsPanel';

interface FinanceiroData {
  month: string;
  clientFiltered: boolean;
  kpis: {
    receita: { value: number; varPct: number | null };
    despesas: { value: number; varPct: number | null };
    lucroLiquido: { value: number; varPct: number | null };
    margemLiquida: { value: number | null; varPp: number | null };
    margemContribuicao: { value: number | null; produtos: number };
    inadimplencia: { value: number | null; varPp: number | null };
    ebitda: { value: number; varPct: number | null; margemEbitda: number | null };
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
  const filter = useFinanceFilter();
  const { data, loading, error, reload } = useFetch<FinanceiroData>(`/api/financeiro?${filter.query}`);

  return (
    <>
      <PageHeader
        title="Dashboard Financeiro"
        subtitle="Receita, despesa, lucro e caixa"
        right={<FinanceFilterBar {...filter} />}
      />

      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && !loading && (
        <div className="space-y-4">
          {data.clientFiltered && (
            <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
              Filtrado por cliente: apenas a <strong>Receita</strong> reflete o cliente selecionado. Despesas,
              Lucro e Margem continuam sendo os da empresa inteira (despesas não têm cliente associado).
            </div>
          )}
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

          {/* ---------- Fase 2: Margem de Contribuição, Inadimplência do período, EBITDA ---------- */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              title="Margem de Contribuição"
              icon={Wallet}
              value={data.kpis.margemContribuicao.value}
              formatter={(v) => fmtPct(v)}
              delta={undefined}
              emptyHint="Sem produtos"
              footer={
                <p className="text-[10px] leading-snug text-mut">
                  Média de {data.kpis.margemContribuicao.produtos} produto(s) —{' '}
                  <Link to="/configuracoes?tab=produtos" className="text-accent hover:underline">
                    cadastro de produtos
                  </Link>
                </p>
              }
            />
            <KpiCard
              title="Inadimplência do Período"
              icon={UserX}
              value={data.kpis.inadimplencia.value}
              formatter={(v) => fmtPct(v)}
              delta={data.kpis.inadimplencia.varPp}
              deltaSuffix=" p.p."
              invertDelta
              emptyHint="Sem contas a receber no período"
              footer={
                <p className="text-[10px] leading-snug text-mut">
                  Vencido e não pago ÷ total a receber do período filtrado (diferente do indicador de Alertas, que
                  usa janela fixa de 12 meses).
                </p>
              }
            />
            <KpiCard
              title="EBITDA"
              icon={TrendingUp}
              value={data.kpis.ebitda.value}
              formatter={fmtBRLCompact}
              delta={data.kpis.ebitda.varPct}
              footer={
                <p className="text-[10px] leading-snug text-mut">
                  Margem EBITDA: {data.kpis.ebitda.margemEbitda !== null ? fmtPct(data.kpis.ebitda.margemEbitda) : '—'}
                </p>
              }
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
