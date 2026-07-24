import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { fmtBRL, fmtDateISO, fmtPct, todayISO } from '../lib/format';
import { C } from '../lib/palette';
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Modal, PageHeader,
  ProgressBar, SectionTitle, Select, SourceBadge, Spinner, Table, Td, TextInput, Tr,
} from '../components/ui';
import { PeriodPicker, usePeriod } from '../components/pickers';
import { TimeSeriesLine } from '../components/charts';

interface DespesasData {
  total: number;
  porCategoria: { categoria: string; valor: number; pct: number }[];
  evolucao: { label: string; value: number }[];
  itens: {
    id: string;
    descricao: string | null;
    categoria: string;
    classificacao: string;
    comportamentoCusto: string | null;
    valor: number;
    data: string;
    source: string;
  }[];
}

// Rótulos amigáveis da classificação DRE (ver backend src/lib/constants.ts)
const KIND_LABEL: Record<string, string> = {
  DEDUCAO: 'Dedução s/ receita',
  CUSTO: 'Custo direto (CMV)',
  OPERACIONAL: 'Despesa operacional',
  DEPRECIACAO: 'Depreciação',
  FINANCEIRA: 'Financeira (juros)',
  OUTRA: 'Outra',
};

// Classificação independente de `kind`, só usada pelo Ponto de Equilíbrio
// (aba Financeiro) — opcional de propósito (ver backend src/lib/constants.ts).
const COST_BEHAVIOR_LABEL: Record<string, string> = {
  FIXO: 'Fixo',
  VARIAVEL: 'Variável',
};

const emptyForm = {
  category: '',
  kind: 'OPERACIONAL',
  costBehavior: '',
  description: '',
  amount: '',
  date: todayISO(),
};

export function Despesas() {
  const period = usePeriod();
  const url = `/api/despesas?from=${period.value.from}&to=${period.value.to}`;
  const { data, loading, error, reload } = useFetch<DespesasData>(url);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/api/despesas', {
        category: form.category || 'Geral',
        kind: form.kind,
        costBehavior: form.costBehavior || undefined,
        description: form.description || undefined,
        amount: Number(form.amount),
        date: form.date,
      });
      setOpen(false);
      setForm(emptyForm);
      reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este lançamento de despesa?')) return;
    await api.del(`/api/despesas/${id}`);
    reload();
  };

  return (
    <>
      <PageHeader
        title="Despesas"
        subtitle="Saídas por período e categoria, com classificação DRE"
        right={<Button onClick={() => setOpen(true)}><span className="inline-flex items-center gap-1.5"><Plus size={13} /> Nova despesa</span></Button>}
      />

      <div className="mb-4">
        <PeriodPicker {...period} />
      </div>

      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mut">Total do período</p>
              <p className="tnum mt-1 text-2xl font-extrabold text-neg">{fmtBRL(data.total)}</p>
            </Card>
            <Card>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mut">Categorias</p>
              <p className="tnum mt-1 text-2xl font-extrabold">{data.porCategoria.length}</p>
            </Card>
            <Card>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mut">Lançamentos</p>
              <p className="tnum mt-1 text-2xl font-extrabold">{data.itens.length}</p>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card hover={false}>
              <SectionTitle>Evolução das despesas no período</SectionTitle>
              {data.evolucao.length > 1 ? (
                <TimeSeriesLine data={data.evolucao} series={[{ key: 'value', name: 'Despesas', color: C.neg }]} height={250} />
              ) : (
                <EmptyState title="Poucos pontos para desenhar a evolução" hint="Lance despesas em datas diferentes do período." />
              )}
            </Card>
            <Card hover={false}>
              <SectionTitle>Por categoria</SectionTitle>
              {data.porCategoria.length === 0 ? (
                <EmptyState title="Sem despesas no período" />
              ) : (
                <div className="space-y-3">
                  {data.porCategoria.map((c) => (
                    <div key={c.categoria}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium">{c.categoria}</span>
                        <span className="tnum text-mut">
                          {fmtBRL(c.valor)} · {fmtPct(c.pct, 0)}
                        </span>
                      </div>
                      <ProgressBar pct={c.pct} color={C.neg} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card hover={false}>
            <SectionTitle>Lançamentos ({data.itens.length})</SectionTitle>
            {data.itens.length === 0 ? (
              <EmptyState title="Nenhuma despesa no período" hint="Use o botão “Nova despesa” para lançar saídas." />
            ) : (
              <Table columns={['Data', 'Categoria', 'Classificação DRE', 'Custo', 'Descrição', 'Origem', 'Valor', '']}>
                {data.itens.map((d) => (
                  <Tr key={d.id}>
                    <Td>{fmtDateISO(d.data)}</Td>
                    <Td>{d.categoria}</Td>
                    <Td><Badge text={KIND_LABEL[d.classificacao] ?? d.classificacao} color={C.silver} /></Td>
                    <Td>
                      {d.comportamentoCusto ? (
                        <Badge text={COST_BEHAVIOR_LABEL[d.comportamentoCusto] ?? d.comportamentoCusto} color={d.comportamentoCusto === 'FIXO' ? C.warn : C.blue} />
                      ) : (
                        <span className="text-mut">—</span>
                      )}
                    </Td>
                    <Td className="max-w-[240px] truncate text-mut">{d.descricao ?? '—'}</Td>
                    <Td><SourceBadge source={d.source} /></Td>
                    <Td right>{fmtBRL(d.valor)}</Td>
                    <Td right>
                      <button
                        title="Excluir"
                        onClick={() => remove(d.id)}
                        className="rounded-md p-1.5 text-mut transition-colors hover:bg-neg/10 hover:text-neg"
                      >
                        <Trash2 size={14} />
                      </button>
                    </Td>
                  </Tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      <Modal title="Nova despesa" open={open} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Categoria">
            <TextInput
              list="categorias-despesa"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Ex.: Folha de pagamento, Marketing, Aluguel"
            />
            <datalist id="categorias-despesa">
              {data?.porCategoria.map((c) => <option key={c.categoria} value={c.categoria} />)}
            </datalist>
          </Field>
          <Field label="Classificação DRE (define waterfall e EBITDA)">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {Object.entries(KIND_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Comportamento de custo (opcional — alimenta o Ponto de Equilíbrio no Financeiro)">
            <Select value={form.costBehavior} onChange={(e) => setForm({ ...form, costBehavior: e.target.value })}>
              <option value="">Não classificado</option>
              {Object.entries(COST_BEHAVIOR_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Descrição (opcional)">
            <TextInput value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <TextInput
                type="number" min="0" step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Data">
              <TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
          </div>
          {formError && <p className="text-xs text-neg">{formError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving || !form.amount || !form.date}>
              {saving ? 'Salvando…' : 'Salvar despesa'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
