import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck2, CalendarX2, Pencil, Plus, Trash2, Users2 } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import { fmtBRL, fmtPct } from '../lib/format';
import { C } from '../lib/palette';
import {
  Badge, Button, Card, EmptyState, Field, Modal, PageHeader,
  SectionTitle, Select, Spinner, Table, Td, TextInput, Tr,
} from '../components/ui';

/* ================================================================
   CONFIGURAÇÕES — produtos, metas, alertas, equipe/vendedores,
   integrações e usuários. Tudo que os dashboards usam como regra
   (metas e thresholds) é editado AQUI, nunca fixo em componente.
   ================================================================ */

const TABS = [
  { key: 'produtos', label: 'Produtos' },
  { key: 'metas', label: 'Metas' },
  { key: 'alertas', label: 'Alertas' },
  { key: 'balanco', label: 'Balanço & DFC' },
  { key: 'equipe', label: 'Equipe & Vendedores' },
  { key: 'integracoes', label: 'Integrações' },
  { key: 'usuarios', label: 'Usuários' },
];

export function Configuracoes() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'produtos';

  return (
    <>
      <PageHeader title="Configurações" subtitle="Cadastros e regras que alimentam todos os dashboards" />

      <div className="mb-5 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams({ tab: t.key })}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors ${
              tab === t.key ? 'border-accent text-accent' : 'border-transparent text-mut hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'produtos' && <ProdutosTab />}
      {tab === 'metas' && <MetasTab />}
      {tab === 'alertas' && <AlertasTab />}
      {tab === 'balanco' && <BalancoTab />}
      {tab === 'equipe' && <EquipeTab />}
      {tab === 'integracoes' && <IntegracoesTab />}
      {tab === 'usuarios' && <UsuariosTab />}
    </>
  );
}

/* ---------------- Produtos ---------------- */

interface Produto {
  id: string;
  name: string;
  costPrice: number;
  salePrice: number;
  active: boolean;
  margemContribuicao: number | null;
}

const emptyProduto = { id: '', name: '', costPrice: '', salePrice: '', active: true };

function ProdutosTab() {
  const { data, loading, reload } = useFetch<Produto[]>('/api/config/produtos');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyProduto);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const margem =
    Number(form.salePrice) > 0
      ? ((Number(form.salePrice) - Number(form.costPrice || 0)) / Number(form.salePrice)) * 100
      : null;

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body = {
        name: form.name,
        costPrice: Number(form.costPrice),
        salePrice: Number(form.salePrice),
        active: form.active,
      };
      if (form.id) await api.put(`/api/config/produtos/${form.id}`, body);
      else await api.post('/api/config/produtos', body);
      setOpen(false);
      setForm(emptyProduto);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Produto) => {
    if (!confirm(`Excluir o produto "${p.name}"?`)) return;
    await api.del(`/api/config/produtos/${p.id}`);
    reload();
  };

  return (
    <Card hover={false}>
      <SectionTitle
        right={
          <Button onClick={() => { setForm(emptyProduto); setOpen(true); }}>
            <span className="inline-flex items-center gap-1.5"><Plus size={13} /> Novo produto</span>
          </Button>
        }
      >
        Produtos — base da margem de contribuição do Executivo
      </SectionTitle>
      {loading && <Spinner />}
      {data && data.length === 0 && (
        <EmptyState
          title="Nenhum produto cadastrado"
          hint="O KPI “Margem de Contribuição” do Executivo usa a fórmula (Preço Venda − Preço Custo) ÷ Preço Venda dos produtos daqui."
        />
      )}
      {data && data.length > 0 && (
        <Table columns={['Produto', 'Preço de custo', 'Preço de venda', 'Margem de contribuição', 'Status', '']}>
          {data.map((p) => (
            <Tr key={p.id}>
              <Td className="font-medium">{p.name}</Td>
              <Td right>{fmtBRL(p.costPrice, 2)}</Td>
              <Td right>{fmtBRL(p.salePrice, 2)}</Td>
              <Td right>
                {p.margemContribuicao === null ? '—' : (
                  <span
                    className="tnum font-bold"
                    style={{ color: p.margemContribuicao >= 40 ? C.pos : p.margemContribuicao >= 20 ? C.warn : C.neg }}
                  >
                    {fmtPct(p.margemContribuicao)}
                  </span>
                )}
              </Td>
              <Td><Badge text={p.active ? 'ATIVO' : 'INATIVO'} color={p.active ? C.pos : C.mut} /></Td>
              <Td right>
                <span className="inline-flex gap-1">
                  <button
                    title="Editar"
                    onClick={() => {
                      setForm({ id: p.id, name: p.name, costPrice: String(p.costPrice), salePrice: String(p.salePrice), active: p.active });
                      setOpen(true);
                    }}
                    className="rounded-md p-1.5 text-mut hover:bg-panel2 hover:text-ink"
                  >
                    <Pencil size={13} />
                  </button>
                  <button title="Excluir" onClick={() => remove(p)} className="rounded-md p-1.5 text-mut hover:bg-neg/10 hover:text-neg">
                    <Trash2 size={13} />
                  </button>
                </span>
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      <Modal title={form.id ? 'Editar produto' : 'Novo produto'} open={open} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Nome">
            <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preço de custo (R$)">
              <TextInput type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
            </Field>
            <Field label="Preço de venda (R$)">
              <TextInput type="number" min="0" step="0.01" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line bg-panel2/40 px-3 py-2.5 text-xs">
            <span className="text-mut">Margem de contribuição resultante</span>
            <span className="tnum font-bold">{margem === null ? '—' : fmtPct(margem)}</span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Produto ativo (entra na média do Executivo)
          </label>
          {err && <p className="text-xs text-neg">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving || !form.name.trim() || form.salePrice === ''}>
              {saving ? 'Salvando…' : 'Salvar produto'}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

/* ---------------- Metas ---------------- */

interface MetasData {
  metricas: { key: string; label: string; unit: string }[];
  metas: { id: string; metricKey: string; period: string; value: number }[];
}

function MetasTab() {
  const { data, loading, reload } = useFetch<MetasData>('/api/config/metas');
  const [values, setValues] = useState<Record<string, string>>({});
  const [override, setOverride] = useState({ metricKey: '', period: '', value: '' });
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const v: Record<string, string> = {};
    for (const m of data.metricas) {
      const row = data.metas.find((g) => g.metricKey === m.key && g.period === 'default');
      v[m.key] = row ? String(row.value) : '';
    }
    setValues(v);
  }, [data]);

  const saveDefault = async (metricKey: string) => {
    await api.put('/api/config/metas', { metricKey, period: 'default', value: Number(values[metricKey]) });
    setSavedKey(metricKey);
    setTimeout(() => setSavedKey(null), 1600);
    reload();
  };

  const addOverride = async () => {
    await api.put('/api/config/metas', {
      metricKey: override.metricKey,
      period: override.period,
      value: Number(override.value),
    });
    setOverride({ metricKey: '', period: '', value: '' });
    reload();
  };

  const removeGoal = async (id: string) => {
    await api.del(`/api/config/metas/${id}`);
    reload();
  };

  if (loading || !data) return <Spinner />;

  const overrides = data.metas.filter((g) => g.period !== 'default');

  return (
    <div className="space-y-4">
      <Card hover={false}>
        <SectionTitle>Metas padrão (valem para todos os meses)</SectionTitle>
        <div className="space-y-2.5">
          {data.metricas.map((m) => (
            <div key={m.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel2/40 px-3.5 py-3">
              <div className="min-w-[220px] flex-1">
                <p className="text-[13px] font-semibold">{m.label}</p>
                <p className="text-[11px] text-mut">Unidade: {m.unit}</p>
              </div>
              <TextInput
                type="number"
                step="0.01"
                value={values[m.key] ?? ''}
                onChange={(e) => setValues({ ...values, [m.key]: e.target.value })}
                placeholder="sem meta"
                style={{ width: 160 }}
              />
              <Button variant="ghost" onClick={() => saveDefault(m.key)} disabled={values[m.key] === '' || values[m.key] === undefined}>
                {savedKey === m.key ? 'Salvo ✓' : 'Salvar'}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card hover={false}>
        <SectionTitle>Metas específicas por mês (sobrepõem a padrão)</SectionTitle>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="Métrica">
            <Select value={override.metricKey} onChange={(e) => setOverride({ ...override, metricKey: e.target.value })}>
              <option value="">— selecionar —</option>
              {data.metricas.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Mês">
            <TextInput type="month" value={override.period} onChange={(e) => setOverride({ ...override, period: e.target.value })} />
          </Field>
          <Field label="Valor">
            <TextInput type="number" step="0.01" value={override.value} onChange={(e) => setOverride({ ...override, value: e.target.value })} />
          </Field>
          <Button onClick={addOverride} disabled={!override.metricKey || !override.period || override.value === ''}>
            Adicionar
          </Button>
        </div>
        {overrides.length === 0 ? (
          <p className="text-xs text-mut">Nenhuma meta específica cadastrada.</p>
        ) : (
          <Table columns={['Métrica', 'Mês', 'Valor', '']}>
            {overrides.map((g) => (
              <Tr key={g.id}>
                <Td>{data.metricas.find((m) => m.key === g.metricKey)?.label ?? g.metricKey}</Td>
                <Td>{g.period}</Td>
                <Td right>{g.value.toLocaleString('pt-BR')}</Td>
                <Td right>
                  <button onClick={() => removeGoal(g.id)} className="rounded-md p-1.5 text-mut hover:bg-neg/10 hover:text-neg">
                    <Trash2 size={13} />
                  </button>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Balanço Patrimonial & DFC (lançamento manual por mês) ---------------- */

interface BalanceSheetForm {
  currentAssets: string;
  inventory: string;
  nonCurrentAssets: string;
  currentLiabilities: string;
  shortTermDebt: string;
  longTermDebt: string;
  cashAndEquivalents: string;
  equity: string;
}

const emptyBalanceSheet: BalanceSheetForm = {
  currentAssets: '',
  inventory: '',
  nonCurrentAssets: '',
  currentLiabilities: '',
  shortTermDebt: '',
  longTermDebt: '',
  cashAndEquivalents: '',
  equity: '',
};

interface CashFlowForm {
  operatingCashFlow: string;
  capex: string;
}

const emptyCashFlow: CashFlowForm = { operatingCashFlow: '', capex: '' };

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function BalancoTab() {
  const [period, setPeriod] = useState(currentPeriod());
  const { data, loading, reload } = useFetch<{
    balanceSheet: (BalanceSheetForm & { id: string }) | null;
    cashFlow: (CashFlowForm & { id: string }) | null;
  }>(`/api/balanco?period=${period}`);

  const [bs, setBs] = useState<BalanceSheetForm>(emptyBalanceSheet);
  const [cf, setCf] = useState<CashFlowForm>(emptyCashFlow);
  const [bsError, setBsError] = useState<string | null>(null);
  const [bsSaved, setBsSaved] = useState(false);
  const [cfSaved, setCfSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBs(
      data?.balanceSheet
        ? {
            currentAssets: String(data.balanceSheet.currentAssets),
            inventory: String(data.balanceSheet.inventory),
            nonCurrentAssets: String(data.balanceSheet.nonCurrentAssets),
            currentLiabilities: String(data.balanceSheet.currentLiabilities),
            shortTermDebt: String(data.balanceSheet.shortTermDebt),
            longTermDebt: String(data.balanceSheet.longTermDebt),
            cashAndEquivalents: String(data.balanceSheet.cashAndEquivalents),
            equity: String(data.balanceSheet.equity),
          }
        : emptyBalanceSheet
    );
    setCf(
      data?.cashFlow
        ? { operatingCashFlow: String(data.cashFlow.operatingCashFlow), capex: String(data.cashFlow.capex) }
        : emptyCashFlow
    );
    setBsError(null);
  }, [data]);

  const n = (v: string) => Number(v || 0);
  const ativoTotal = n(bs.currentAssets) + n(bs.nonCurrentAssets);
  const passivoTotal = n(bs.currentLiabilities) + n(bs.longTermDebt);
  const diferenca = ativoTotal - (passivoTotal + n(bs.equity));
  const fecha = Math.abs(diferenca) < 0.01;

  const salvarBalanco = async () => {
    setSaving(true);
    setBsError(null);
    try {
      await api.put('/api/balanco/balance-sheet', {
        period,
        currentAssets: n(bs.currentAssets),
        inventory: n(bs.inventory),
        nonCurrentAssets: n(bs.nonCurrentAssets),
        currentLiabilities: n(bs.currentLiabilities),
        shortTermDebt: n(bs.shortTermDebt),
        longTermDebt: n(bs.longTermDebt),
        cashAndEquivalents: n(bs.cashAndEquivalents),
        equity: n(bs.equity),
      });
      setBsSaved(true);
      setTimeout(() => setBsSaved(false), 1600);
      reload();
    } catch (err) {
      setBsError(err instanceof ApiError ? err.message : 'Não foi possível salvar o Balanço.');
    } finally {
      setSaving(false);
    }
  };

  const salvarDfc = async () => {
    setSaving(true);
    try {
      await api.put('/api/balanco/cash-flow', { period, operatingCashFlow: n(cf.operatingCashFlow), capex: n(cf.capex) });
      setCfSaved(true);
      setTimeout(() => setCfSaved(false), 1600);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const bsField = (key: keyof BalanceSheetForm, label: string, hint?: string) => (
    <Field label={label}>
      <TextInput
        type="number"
        step="0.01"
        value={bs[key]}
        onChange={(e) => setBs({ ...bs, [key]: e.target.value })}
        placeholder="0,00"
      />
      {hint && <p className="mt-1 text-[10px] text-mut">{hint}</p>}
    </Field>
  );

  return (
    <div className="space-y-4">
      <Card hover={false}>
        <SectionTitle right={<TextInput type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 160 }} />}>
          Período do lançamento
        </SectionTitle>
        <p className="text-xs leading-relaxed text-mut">
          Balanço Patrimonial e DFC não são derivados de Receitas/Despesas/Vendas — precisam ser lançados manualmente
          a cada mês. Alimentam os índices de Liquidez, Alavancagem, Giro de Ativos, Runway de Caixa e o Score de
          Saúde Financeira na aba Financeiro.
        </p>
      </Card>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <Card hover={false}>
            <SectionTitle>Balanço Patrimonial — {period}</SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {bsField('currentAssets', 'Ativo Circulante')}
              {bsField('inventory', 'Estoques', 'Subconjunto do Ativo Circulante')}
              {bsField('nonCurrentAssets', 'Ativo Não Circulante')}
              {bsField('currentLiabilities', 'Passivo Circulante', 'Já inclui a dívida de curto prazo')}
              {bsField('shortTermDebt', 'Dívida de Curto Prazo', 'Só para o cálculo de alavancagem')}
              {bsField('longTermDebt', 'Dívida de Longo Prazo')}
              {bsField('cashAndEquivalents', 'Caixa e Equivalentes')}
              {bsField('equity', 'Patrimônio Líquido')}
            </div>

            <div
              className={`mt-4 rounded-lg border px-3.5 py-2.5 text-xs ${
                fecha ? 'border-pos/30 bg-pos/10 text-pos' : 'border-warn/30 bg-warn/10 text-warn'
              }`}
            >
              Ativo Total: {fmtBRL(ativoTotal)} — Passivo + PL: {fmtBRL(passivoTotal + n(bs.equity))}
              {fecha ? ' — balanço fecha ✓' : ` — diferença de ${fmtBRL(Math.abs(diferenca))}, ajuste antes de salvar`}
            </div>
            {bsError && <p className="mt-2 text-xs text-neg">{bsError}</p>}

            <div className="mt-3 flex justify-end">
              <Button onClick={salvarBalanco} disabled={saving}>
                {bsSaved ? 'Salvo ✓' : 'Salvar Balanço'}
              </Button>
            </div>
          </Card>

          <Card hover={false}>
            <SectionTitle>DFC — Demonstração de Fluxo de Caixa — {period}</SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Fluxo de Caixa Operacional do mês">
                <TextInput
                  type="number"
                  step="0.01"
                  value={cf.operatingCashFlow}
                  onChange={(e) => setCf({ ...cf, operatingCashFlow: e.target.value })}
                  placeholder="0,00"
                />
              </Field>
              <Field label="CAPEX do mês">
                <TextInput
                  type="number"
                  step="0.01"
                  value={cf.capex}
                  onChange={(e) => setCf({ ...cf, capex: e.target.value })}
                  placeholder="0,00"
                />
              </Field>
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={salvarDfc} disabled={saving}>
                {cfSaved ? 'Salvo ✓' : 'Salvar DFC'}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ---------------- Alertas (thresholds) ---------------- */

interface ThresholdRow {
  metricKey: string;
  label: string;
  unit: string;
  description: string;
  defaultDirection: string;
  configured: boolean;
  yellowThreshold: number | null;
  redThreshold: number | null;
  direction: string;
  scope: string;
}

function AlertasTab() {
  const { data, loading, reload } = useFetch<ThresholdRow[]>('/api/config/thresholds');
  const [edit, setEdit] = useState<Record<string, { yellow: string; red: string; direction: string; scope: string }>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const v: typeof edit = {};
    for (const t of data) {
      v[t.metricKey] = {
        yellow: t.yellowThreshold === null ? '' : String(t.yellowThreshold),
        red: t.redThreshold === null ? '' : String(t.redThreshold),
        direction: t.direction,
        scope: t.scope,
      };
    }
    setEdit(v);
  }, [data]);

  const save = async (metricKey: string) => {
    const e = edit[metricKey];
    await api.put(`/api/config/thresholds/${metricKey}`, {
      yellowThreshold: Number(e.yellow),
      redThreshold: Number(e.red),
      direction: e.direction,
      scope: e.scope,
    });
    setSavedKey(metricKey);
    setTimeout(() => setSavedKey(null), 1600);
    reload();
  };

  const removeRule = async (metricKey: string) => {
    if (!confirm('Remover a regra? A métrica deixa de gerar alertas até ser configurada de novo.')) return;
    await api.del(`/api/config/thresholds/${metricKey}`);
    reload();
  };

  if (loading || !data) return <Spinner />;

  return (
    <Card hover={false}>
      <SectionTitle>Regras de alerta — sistema de 3 cores (confortável / atenção / crítico)</SectionTitle>
      <p className="mb-4 text-xs leading-relaxed text-mut">
        Direção <b className="text-ink">BELOW</b>: alerta quando o valor cai abaixo do limiar (ex.: margem líquida &lt; 15% = atenção).
        Direção <b className="text-ink">ABOVE</b>: alerta quando o valor sobe acima do limiar (ex.: inadimplência &gt; 7% = crítico).
        Os painéis Executivo e Financeiro leem estas regras direto do banco — nada é fixo no código.
      </p>
      <div className="space-y-2.5">
        {data.map((t) => {
          const e = edit[t.metricKey];
          if (!e) return null;
          return (
            <div key={t.metricKey} className="rounded-lg border border-line bg-panel2/40 p-3.5">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[13px] font-semibold">{t.label}</span>
                  <span className="ml-2 text-[11px] text-mut">{t.description} ({t.unit})</span>
                </div>
                {t.configured ? <Badge text="ATIVA" color={C.pos} /> : <Badge text="SEM REGRA" color={C.mut} />}
              </div>
              <div className="flex flex-wrap items-end gap-2.5">
                <Field label={`Atenção (amarelo) — ${t.unit}`}>
                  <TextInput type="number" step="0.1" value={e.yellow} onChange={(ev) => setEdit({ ...edit, [t.metricKey]: { ...e, yellow: ev.target.value } })} style={{ width: 130 }} />
                </Field>
                <Field label={`Crítico (vermelho) — ${t.unit}`}>
                  <TextInput type="number" step="0.1" value={e.red} onChange={(ev) => setEdit({ ...edit, [t.metricKey]: { ...e, red: ev.target.value } })} style={{ width: 130 }} />
                </Field>
                <Field label="Direção">
                  <Select value={e.direction} onChange={(ev) => setEdit({ ...edit, [t.metricKey]: { ...e, direction: ev.target.value } })}>
                    <option value="BELOW">BELOW (abaixo é ruim)</option>
                    <option value="ABOVE">ABOVE (acima é ruim)</option>
                  </Select>
                </Field>
                <Field label="Aparece em">
                  <Select value={e.scope} onChange={(ev) => setEdit({ ...edit, [t.metricKey]: { ...e, scope: ev.target.value } })}>
                    <option value="ambos">Executivo + Financeiro</option>
                    <option value="executivo">Só Executivo</option>
                    <option value="financeiro">Só Financeiro</option>
                  </Select>
                </Field>
                <Button variant="ghost" onClick={() => save(t.metricKey)} disabled={e.yellow === '' || e.red === ''}>
                  {savedKey === t.metricKey ? 'Salvo ✓' : 'Salvar'}
                </Button>
                {t.configured && (
                  <Button variant="danger" onClick={() => removeRule(t.metricKey)}>Remover</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------------- Equipe & Vendedores ---------------- */

interface Catalogos {
  sellers: { id: string; name: string }[];
  teams: { id: string; name: string }[];
}

function EquipeTab() {
  const { data, loading, reload } = useFetch<Catalogos>('/api/config/catalogos');
  const [seller, setSeller] = useState('');
  const [team, setTeam] = useState('');

  if (loading || !data) return <Spinner />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card hover={false}>
        <SectionTitle>Vendedores (aba Vendas)</SectionTitle>
        <div className="mb-3 flex gap-2">
          <TextInput placeholder="Nome do vendedor…" value={seller} onChange={(e) => setSeller(e.target.value)} />
          <Button
            onClick={async () => {
              await api.post('/api/config/vendedores', { name: seller.trim() });
              setSeller('');
              reload();
            }}
            disabled={!seller.trim()}
          >
            Adicionar
          </Button>
        </div>
        {data.sellers.length === 0 ? (
          <p className="text-xs text-mut">Nenhum vendedor cadastrado.</p>
        ) : (
          <div className="space-y-1.5">
            {data.sellers.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-line bg-panel2/40 px-3 py-2 text-sm">
                {s.name}
                <button
                  onClick={async () => {
                    if (!confirm(`Excluir vendedor "${s.name}"?`)) return;
                    await api.del(`/api/config/vendedores/${s.id}`);
                    reload();
                  }}
                  className="rounded-md p-1 text-mut hover:bg-neg/10 hover:text-neg"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card hover={false}>
        <SectionTitle>Equipes (aba Operações)</SectionTitle>
        <div className="mb-3 flex gap-2">
          <TextInput placeholder="Nome da equipe…" value={team} onChange={(e) => setTeam(e.target.value)} />
          <Button
            onClick={async () => {
              await api.post('/api/operacoes/teams', { name: team.trim() });
              setTeam('');
              reload();
            }}
            disabled={!team.trim()}
          >
            Adicionar
          </Button>
        </div>
        {data.teams.length === 0 ? (
          <p className="text-xs text-mut">Nenhuma equipe cadastrada.</p>
        ) : (
          <div className="space-y-1.5">
            {data.teams.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-line bg-panel2/40 px-3 py-2 text-sm">
                {t.name}
                <button
                  onClick={async () => {
                    if (!confirm(`Excluir equipe "${t.name}"? As tarefas dela ficam sem equipe.`)) return;
                    await api.del(`/api/operacoes/teams/${t.id}`);
                    reload();
                  }}
                  className="rounded-md p-1 text-mut hover:bg-neg/10 hover:text-neg"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Integrações ---------------- */

interface IntegracoesData {
  googleCalendar: { configured: boolean; connected: boolean; missingEnvVars: string[] };
}

function IntegracoesTab() {
  return (
    <div className="space-y-4">
      <GoogleCalendarCard />
      <NfeImportCard />
      <DominioImportCard />
    </div>
  );
}

function GoogleCalendarCard() {
  const { data, loading } = useFetch<IntegracoesData>('/api/config/integracoes');
  if (loading || !data) return <Spinner />;
  const gc = data.googleCalendar;
  return (
    <Card hover={false}>
      <SectionTitle>Credenciais de integração</SectionTitle>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel2/40 p-4">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${gc.connected ? 'bg-pos/10 text-pos' : 'bg-panel text-mut'}`}>
            {gc.connected ? <CalendarCheck2 size={20} /> : <CalendarX2 size={20} />}
          </span>
          <div>
            <p className="text-sm font-bold">Google Calendar</p>
            <p className="text-xs text-mut">
              {gc.connected
                ? 'Conectado — eventos visíveis na aba Calendário'
                : gc.configured
                  ? 'Credenciais OK — falta autorizar na aba Calendário'
                  : `Não configurado. Variáveis ausentes no backend/.env: ${gc.missingEnvVars.join(', ')}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {gc.connected ? <Badge text="CONECTADO" color={C.pos} /> : gc.configured ? <Badge text="AGUARDANDO AUTORIZAÇÃO" color={C.warn} /> : <Badge text="NÃO CONFIGURADO" color={C.neg} />}
          <Link to="/calendario" className="text-xs font-semibold text-accent hover:underline">Abrir Calendário →</Link>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-mut">
        As credenciais ficam no arquivo <code className="text-accent">backend/.env</code> (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI) — instruções completas no próprio arquivo e na aba Calendário. Tokens OAuth são armazenados
        no banco (tabela integration_tokens) e podem ser revogados desconectando na aba Calendário.
      </p>
    </Card>
  );
}

/* ---------------- Importação de NF-e (receitas/vendas automáticas) ---------------- */

interface NfeStatus {
  configured: boolean;
  dir: string | null;
  ultimaImportacao: string | null;
  totalImportadas: number;
  totalErros: number;
}

function NfeImportCard() {
  const { data, loading, reload } = useFetch<NfeStatus>('/api/importacoes/nfe/status');
  const [importing, setImporting] = useState(false);
  const [resultado, setResultado] = useState<{ resumo: Record<string, number> } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const importar = async () => {
    setImporting(true);
    setErro(null);
    setResultado(null);
    try {
      const r = await api.post<{ resumo: Record<string, number> }>('/api/importacoes/nfe/importar', {});
      setResultado(r);
      reload();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  if (loading || !data) return <Spinner />;

  return (
    <Card hover={false}>
      <SectionTitle>Notas fiscais de saída (NF-e)</SectionTitle>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel2/40 p-4">
        <div>
          <p className="text-sm font-bold">Importação de XML de NF-e</p>
          <p className="text-xs text-mut">
            {data.configured
              ? `Pasta monitorada: ${data.dir}`
              : 'Não configurado. Defina NFE_IMPORT_DIR no backend/.env.'}
          </p>
          {data.ultimaImportacao && (
            <p className="mt-1 text-xs text-mut">
              Última importação: {new Date(data.ultimaImportacao).toLocaleString('pt-BR')} —{' '}
              {data.totalImportadas} nota(s) importada(s)
              {data.totalErros > 0 ? `, ${data.totalErros} com erro` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data.configured ? <Badge text="CONFIGURADO" color={C.pos} /> : <Badge text="NÃO CONFIGURADO" color={C.neg} />}
          <Button onClick={importar} disabled={!data.configured || importing}>
            {importing ? 'Importando…' : 'Importar agora'}
          </Button>
        </div>
      </div>
      {resultado && (
        <p className="mt-3 text-xs text-pos">
          Concluído: {Object.entries(resultado.resumo).map(([k, v]) => `${k}: ${v}`).join(' · ')}
        </p>
      )}
      {erro && <p className="mt-3 text-xs text-neg">{erro}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-mut">
        Os XMLs são baixados por um robô separado (SIEG) e salvos numa pasta no servidor. Cada nota vira
        automaticamente clientes, produtos, vendas e contas a receber — sem digitação manual. Também é possível
        rodar via linha de comando: <code className="text-accent">npm run import:nfe -- &lt;pasta&gt;</code>. Notas já
        importadas (mesma chave de acesso) nunca são duplicadas.
      </p>
    </Card>
  );
}

/* ---------------- Importação de despesas do Domínio (planilha com mapeamento) ---------------- */

interface PreviewData {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
}
interface ExpenseImportResult {
  totalLinhas: number;
  importadas: number;
  duplicadasIgnoradas: number;
  linhasDuplicadas: number[];
  erros: { linha: number; motivo: string }[];
}

function DominioImportCard() {
  const { data: catalogos } = useFetch<{ expenseKinds: string[] }>('/api/config/catalogos');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'upload' | 'mapeamento' | 'resultado'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState({
    dateColumn: '',
    descriptionColumn: '',
    categoryColumn: '',
    amountColumn: '',
    kindColumn: '',
    defaultKind: 'OPERACIONAL',
    dateFormat: 'DMY',
    decimalSeparator: ',',
  });
  const [resultado, setResultado] = useState<ExpenseImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviarPreview = async () => {
    if (!file) return;
    setBusy(true);
    setErro(null);
    try {
      const fd = new FormData();
      fd.append('arquivo', file);
      const p = await api.postForm<PreviewData>('/api/importacoes/dominio/preview', fd);
      setPreview(p);
      setMapping((m) => ({ ...m, dateColumn: p.headers[0] ?? '', amountColumn: p.headers[1] ?? '' }));
      setStep('mapeamento');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmar = async () => {
    if (!file) return;
    setBusy(true);
    setErro(null);
    try {
      const fd = new FormData();
      fd.append('arquivo', file);
      fd.append('mapping', JSON.stringify(mapping));
      const r = await api.postForm<ExpenseImportResult>('/api/importacoes/dominio/confirmar', fd);
      setResultado(r);
      setStep('resultado');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setOpen(false);
    setStep('upload');
    setFile(null);
    setPreview(null);
    setResultado(null);
    setErro(null);
  };

  return (
    <Card hover={false}>
      <SectionTitle right={<Button onClick={() => setOpen(true)}>Importar planilha do Domínio</Button>}>
        Despesas — exportação do sistema Domínio
      </SectionTitle>
      <p className="text-xs text-mut">
        Exporte a planilha (.xlsx ou .csv) direto do Domínio Sistemas e envie aqui. Você escolhe quais colunas
        da planilha correspondem a data, valor, categoria e classificação DRE antes de confirmar — evita digitar
        despesa por despesa.
      </p>

      <Modal title="Importar despesas do Domínio" open={open} onClose={reset} wide>
        {step === 'upload' && (
          <div className="space-y-3">
            <Field label="Arquivo (.xlsx ou .csv)">
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </Field>
            {erro && <p className="text-xs text-neg">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={reset}>Cancelar</Button>
              <Button onClick={enviarPreview} disabled={!file || busy}>
                {busy ? 'Lendo…' : 'Continuar'}
              </Button>
            </div>
          </div>
        )}

        {step === 'mapeamento' && preview && (
          <div className="space-y-3">
            <p className="text-xs text-mut">{preview.totalRows} linha(s) detectada(s). Confira o mapeamento:</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Coluna de Data *">
                <Select value={mapping.dateColumn} onChange={(e) => setMapping({ ...mapping, dateColumn: e.target.value })}>
                  {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </Field>
              <Field label="Formato da data">
                <Select value={mapping.dateFormat} onChange={(e) => setMapping({ ...mapping, dateFormat: e.target.value })}>
                  <option value="DMY">DD/MM/AAAA</option>
                  <option value="YMD">AAAA-MM-DD</option>
                  <option value="MDY">MM/DD/AAAA</option>
                </Select>
              </Field>
              <Field label="Coluna de Valor *">
                <Select value={mapping.amountColumn} onChange={(e) => setMapping({ ...mapping, amountColumn: e.target.value })}>
                  {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </Field>
              <Field label="Separador decimal">
                <Select value={mapping.decimalSeparator} onChange={(e) => setMapping({ ...mapping, decimalSeparator: e.target.value })}>
                  <option value=",">Vírgula (1.234,56)</option>
                  <option value=".">Ponto (1234.56)</option>
                </Select>
              </Field>
              <Field label="Coluna de Descrição">
                <Select value={mapping.descriptionColumn} onChange={(e) => setMapping({ ...mapping, descriptionColumn: e.target.value })}>
                  <option value="">— nenhuma —</option>
                  {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </Field>
              <Field label="Coluna de Categoria">
                <Select value={mapping.categoryColumn} onChange={(e) => setMapping({ ...mapping, categoryColumn: e.target.value })}>
                  <option value="">— nenhuma (usa "Geral") —</option>
                  {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </Field>
              <Field label="Classificação DRE padrão">
                <Select value={mapping.defaultKind} onChange={(e) => setMapping({ ...mapping, defaultKind: e.target.value })}>
                  {(catalogos?.expenseKinds ?? []).map((k) => <option key={k} value={k}>{k}</option>)}
                </Select>
              </Field>
            </div>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {preview.headers.map((h) => (
                      <th key={h} className="border-b border-line px-2 py-1 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className="border-b border-line/50 px-2 py-1">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {erro && <p className="text-xs text-neg">{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep('upload')}>Voltar</Button>
              <Button onClick={confirmar} disabled={!mapping.dateColumn || !mapping.amountColumn || busy}>
                {busy ? 'Importando…' : 'Confirmar e importar'}
              </Button>
            </div>
          </div>
        )}

        {step === 'resultado' && resultado && (
          <div className="space-y-3">
            <p className="text-sm">
              <b className="text-pos">{resultado.importadas}</b> despesa(s) importada(s),{' '}
              <b>{resultado.duplicadasIgnoradas}</b> ignorada(s) por já existirem,{' '}
              {resultado.erros.length > 0 && <b className="text-neg">{resultado.erros.length} com erro</b>}.
            </p>
            {resultado.erros.length > 0 && (
              <ul className="max-h-40 overflow-y-auto text-xs text-neg">
                {resultado.erros.map((e, i) => <li key={i}>Linha {e.linha}: {e.motivo}</li>)}
              </ul>
            )}
            {resultado.linhasDuplicadas.length > 0 && (
              <p className="text-[11px] leading-relaxed text-mut">
                Linhas tratadas como duplicata (mesma data+valor+descrição de um lançamento já
                existente): {resultado.linhasDuplicadas.join(', ')}. Se alguma dessas era uma
                correção legítima (não um reenvio do mesmo arquivo), ajuste a descrição ou o valor
                e reenvie só essa linha.
              </p>
            )}
            <div className="flex justify-end">
              <Button onClick={reset}>Fechar</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

/* ---------------- Usuários ---------------- */

function UsuariosTab() {
  const { user, company } = useAuth();
  return (
    <Card hover={false}>
      <SectionTitle>Usuários e permissões</SectionTitle>
      <div className="space-y-3">
        <div className="rounded-lg border border-line bg-panel2/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mut">Empresa</p>
          <p className="mt-0.5 text-sm text-ink">{company?.name}</p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-mut">Conta logada</p>
          <p className="mt-0.5 text-sm text-ink">
            {user?.name} — {user?.email}
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-line bg-panel2/40 p-4">
          <Users2 size={18} className="mt-0.5 shrink-0 text-mut" />
          <p className="text-sm leading-relaxed text-mut">
            Cada empresa cadastrada vê só os próprios dados. Múltiplos usuários por empresa (papéis, ex.: dono × financeiro
            × vendas) está previsto como evolução futura — hoje o cadastro cria 1 usuário por empresa.
          </p>
        </div>
      </div>
    </Card>
  );
}
