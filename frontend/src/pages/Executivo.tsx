import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeDollarSign, Percent, PiggyBank, UserPlus, Wallet } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { currentYm, fmtBRLCompact, fmtNum, fmtPct, fmtYm } from '../lib/format';
import { C } from '../lib/palette';
import { Card, EmptyState, ErrorState, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { MonthPicker } from '../components/pickers';
import { ChartLegend, TimeSeriesLine, WaterfallChart, type LineSeriesDef, type WaterfallStep } from '../components/charts';
import { AlertsPanel, type AlertItem } from '../components/AlertsPanel';
import { InsightsPanel, type InsightItem } from '../components/InsightsPanel';

interface Spark {
  label: string;
  value: number;
}

interface ExecutivoData {
  month: string;
  kpis: {
    receitaTotal: { value: number; varPct: number | null; spark: Spark[]; meta: number | null; atingimentoPct: number | null };
    margemEbitda: { value: number | null; varPp: number | null; spark: Spark[] };
    lucroLiquido: { value: number; varPct: number | null; spark: Spark[] };
    margemContribuicao: { value: number | null; produtos: number };
    novosClientes: { value: number; varPct: number | null; spark: Spark[]; meta: number | null };
  };
  indicadores: { label: string; receitaLiquida: number; lucroOperacional: number; ebitda: number; margem: number | null }[];
  waterfall: WaterfallStep[];
  insights: InsightItem[];
  alerts: AlertItem[];
  hasData: boolean;
}

const INDICATOR_SERIES: LineSeriesDef[] = [
  { key: 'receitaLiquida', name: 'Receita Líquida', color: C.accent },
  { key: 'lucroOperacional', name: 'Lucro Operacional', color: C.pos },
  { key: 'ebitda', name: 'EBITDA', color: C.silver },
  { key: 'margem', name: 'Margem Líquida %', color: C.blue, dashed: true, rightAxis: true },
];

export function Executivo() {
  const [ym, setYm] = useState(currentYm());
  const { data, loading, error, reload } = useFetch<ExecutivoData>(`/api/executivo?month=${ym}`);

  return (
    <>
      <PageHeader
        title="Dashboard Executivo"
        subtitle="Visão geral do negócio"
        right={<MonthPicker ym={ym} onChange={setYm} />}
      />

      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && !loading && (
        <div className="space-y-4">
          {!data.hasData && (
            <Card hover={false}>
              <EmptyState
                title="Ainda não há dados no banco"
                hint="Cadastre receitas, despesas, produtos e vendas nas respectivas abas — os indicadores passam a ser calculados automaticamente. Metas e regras de alerta ficam em Configurações."
              />
            </Card>
          )}

          {/* ---------- KPIs ---------- */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              title="Receita Total"
              icon={BadgeDollarSign}
              value={data.kpis.receitaTotal.value}
              formatter={fmtBRLCompact}
              delta={data.kpis.receitaTotal.varPct}
              spark={data.kpis.receitaTotal.spark}
              meta={
                data.kpis.receitaTotal.meta && data.kpis.receitaTotal.atingimentoPct !== null
                  ? { label: `Meta: ${fmtBRLCompact(data.kpis.receitaTotal.meta)}`, pct: data.kpis.receitaTotal.atingimentoPct }
                  : null
              }
            />
            <KpiCard
              title="Margem EBITDA"
              icon={Percent}
              value={data.kpis.margemEbitda.value}
              formatter={(v) => fmtPct(v)}
              delta={data.kpis.margemEbitda.varPp}
              deltaSuffix=" p.p."
              spark={data.kpis.margemEbitda.spark}
              sparkColor={C.silver}
              emptyHint="Sem receita no mês"
            />
            <KpiCard
              title="Lucro Líquido"
              icon={PiggyBank}
              value={data.kpis.lucroLiquido.value}
              formatter={fmtBRLCompact}
              delta={data.kpis.lucroLiquido.varPct}
              spark={data.kpis.lucroLiquido.spark}
              sparkColor={data.kpis.lucroLiquido.value >= 0 ? C.pos : C.neg}
            />
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
              title="Novos Clientes"
              icon={UserPlus}
              value={data.kpis.novosClientes.value}
              formatter={(v) => fmtNum(v)}
              delta={data.kpis.novosClientes.varPct}
              spark={data.kpis.novosClientes.spark}
              sparkColor={C.blue}
              meta={
                data.kpis.novosClientes.meta
                  ? {
                      label: `Meta: ${fmtNum(data.kpis.novosClientes.meta)}`,
                      pct: (data.kpis.novosClientes.value / data.kpis.novosClientes.meta) * 100,
                    }
                  : null
              }
            />
          </div>

          {/* ---------- Evolução dos principais indicadores ---------- */}
          <Card hover={false}>
            <SectionTitle right={<ChartLegend series={INDICATOR_SERIES} />}>
              Evolução dos principais indicadores — últimos 12 meses
            </SectionTitle>
            <TimeSeriesLine data={data.indicadores} series={INDICATOR_SERIES} />
          </Card>

          {/* ---------- Waterfall do resultado ---------- */}
          <Card hover={false}>
            <SectionTitle>Resultado do período — {fmtYm(data.month)}</SectionTitle>
            <WaterfallChart steps={data.waterfall} />
          </Card>

          {/* ---------- Insights + Alertas ---------- */}
          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <InsightsPanel insights={data.insights} />
            <AlertsPanel alerts={data.alerts} />
          </div>
        </div>
      )}
    </>
  );
}
