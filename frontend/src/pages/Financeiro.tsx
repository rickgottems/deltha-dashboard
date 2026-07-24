import { BadgeDollarSign, Percent, PiggyBank, Receipt, TrendingUp, UserX, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { fmtBRLCompact, fmtPct } from '../lib/format';
import { C } from '../lib/palette';
import { Card, EmptyState, ErrorState, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { FinanceFilterBar, useFinanceFilter } from '../components/pickers';
import { CashflowBars, ChartLegend, TimeSeriesLine, type LineSeriesDef } from '../components/charts';
import { AlertsPanel, type AlertItem } from '../components/AlertsPanel';
import { BreakEvenChart, type BreakEvenData } from '../components/BreakEvenChart';

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
  pontoEquilibrio: BreakEvenData;
  saudeFinanceira: {
    score: number;
    metrics: {
      margemEbit: number | null;
      coberturaJuros: number | null;
      liquidezSeca: number | null;
      liquidezCorrente: number | null;
      alavancagemDividaEbitda: number | null;
      giroAtivos: number | null;
      runwayMeses: number | null;
      fcoVsLucro: number | null;
      capexSobreLucro: number | null;
    };
    alerts: AlertItem[];
    compositeAlerts: AlertItem[];
    hasBalanceSheet: boolean;
    hasCashFlow: boolean;
  };
  hasData: boolean;
}

function scoreColor(score: number): string {
  if (score >= 70) return C.pos;
  if (score >= 40) return C.warn;
  return C.neg;
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

          <BreakEvenChart data={data.pontoEquilibrio} />

          {/* ---------- Saúde Financeira (Balanço Patrimonial + DFC) ---------- */}
          <Card hover={false}>
            <SectionTitle
              right={
                <Link to="/configuracoes?tab=balanco" className="text-[11px] font-semibold text-accent hover:underline">
                  Lançar Balanço/DFC
                </Link>
              }
            >
              Score de Saúde Financeira
            </SectionTitle>

            {!data.saudeFinanceira.hasBalanceSheet && !data.saudeFinanceira.hasCashFlow ? (
              <EmptyState
                title="Balanço Patrimonial e DFC ainda não lançados neste mês"
                hint="Liquidez, Alavancagem, Giro de Ativos e Runway de Caixa dependem desses dois demonstrativos — não são deriváveis de Receitas/Despesas/Vendas. Lance em Configurações → Balanço & DFC."
              />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 text-2xl font-extrabold tnum"
                    style={{ borderColor: scoreColor(data.saudeFinanceira.score), color: scoreColor(data.saudeFinanceira.score) }}
                  >
                    {Math.round(data.saudeFinanceira.score)}
                  </div>
                  <p className="text-xs leading-relaxed text-mut">
                    Score de 0 a 100 — heurística determinística sobre DRE + Balanço + DFC (não é IA preditiva; regras e
                    limiares documentados em <code className="text-[11px]">services/healthScore.ts</code>). Penaliza
                    alertas críticos/atenção, bonifica margem EBITDA e liquidez saudáveis.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    { label: 'Margem EBIT', value: data.saudeFinanceira.metrics.margemEbit, fmt: fmtPct },
                    {
                      label: 'Cobertura de Juros',
                      value: data.saudeFinanceira.metrics.coberturaJuros,
                      fmt: (v: number) => `${v.toFixed(2)}x`,
                    },
                    {
                      label: 'Liquidez Seca',
                      value: data.saudeFinanceira.metrics.liquidezSeca,
                      fmt: (v: number) => v.toFixed(2),
                    },
                    {
                      label: 'Liquidez Corrente',
                      value: data.saudeFinanceira.metrics.liquidezCorrente,
                      fmt: (v: number) => v.toFixed(2),
                    },
                    {
                      label: 'Alavancagem Dív/EBITDA',
                      value: data.saudeFinanceira.metrics.alavancagemDividaEbitda,
                      fmt: (v: number) => `${v.toFixed(2)}x`,
                    },
                    {
                      label: 'Giro de Ativos',
                      value: data.saudeFinanceira.metrics.giroAtivos,
                      fmt: (v: number) => v.toFixed(2),
                    },
                    {
                      label: 'CAPEX ÷ Lucro',
                      value: data.saudeFinanceira.metrics.capexSobreLucro,
                      fmt: (v: number) => fmtPct(v),
                    },
                  ].map((m) => (
                    <div key={m.label} className="rounded-lg border border-line bg-panel2/40 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-mut">{m.label}</p>
                      <p className="tnum mt-0.5 text-sm font-bold">{m.value !== null ? m.fmt(m.value) : '—'}</p>
                    </div>
                  ))}
                  <div className="rounded-lg border border-line bg-panel2/40 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-mut">Runway de Caixa</p>
                    <p className="tnum mt-0.5 text-sm font-bold">
                      {!data.saudeFinanceira.hasBalanceSheet || !data.saudeFinanceira.hasCashFlow
                        ? '—'
                        : data.saudeFinanceira.metrics.runwayMeses === null
                          ? 'Gerando caixa'
                          : `${data.saudeFinanceira.metrics.runwayMeses.toFixed(1)} meses`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {data.saudeFinanceira.alerts.length > 0 && (
            <AlertsPanel
              alerts={data.saudeFinanceira.alerts}
              title="Sinais de Alerta — Balanço & DFC"
              configLink={false}
            />
          )}

          {data.saudeFinanceira.compositeAlerts.length > 0 && (
            <AlertsPanel alerts={data.saudeFinanceira.compositeAlerts} title="Diagnósticos Compostos" configLink={false} />
          )}
        </div>
      )}
    </>
  );
}
