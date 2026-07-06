import { useMemo, useState } from 'react';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
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

interface ReceitasData {
  total: number;
  recebido: number;
  emAberto: number;
  porCategoria: { categoria: string; valor: number; pct: number }[];
  evolucao: { label: string; value: number }[];
  itens: {
    id: string;
    descricao: string | null;
    categoria: string;
    cliente: { id: string; name: string } | null;
    valor: number;
    vencimento: string;
    pagamento: string | null;
    status: string;
    source: string;
  }[];
}

interface Catalogos {
  clients: { id: string; name: string }[];
  receivableStatus: string[];
}

const STATUS_COLOR: Record<string, string> = {
  PAGA: C.pos,
  PENDENTE: C.silver,
  ATRASADA: C.neg,
  CANCELADA: C.mut,
};

const emptyForm = {
  description: '',
  category: '',
  amount: '',
  dueDate: todayISO(),
  paidDate: '',
  status: 'PENDENTE',
  clientId: '',
};

export function Receitas() {
  const period = usePeriod();
  const url = `/api/receitas?from=${period.value.from}&to=${period.value.to}`;
  const { data, loading, error, reload } = useFetch<ReceitasData>(url);
  const { data: catalogos } = useFetch<Catalogos>('/api/config/catalogos');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const serie = useMemo(() => data?.evolucao ?? [], [data]);

  const submit = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/api/receitas', {
        description: form.description || undefined,
        category: form.category || 'Geral',
        amount: Number(form.amount),
        dueDate: form.dueDate,
        paidDate: form.paidDate || undefined,
        status: form.paidDate ? 'PAGA' : form.status,
        clientId: form.clientId || undefined,
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

  const markPaid = async (id: string) => {
    await api.put(`/api/receitas/${id}`, { status: 'PAGA', paidDate: todayISO() });
    reload();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este lançamento de receita?')) return;
    await api.del(`/api/receitas/${id}`);
    reload();
  };

  return (
    <>
      <PageHeader
        title="Receitas"
        subtitle="Contas a receber por período, categoria e fonte"
        right={<Button onClick={() => setOpen(true)}><span className="inline-flex items-center gap-1.5"><Plus size={13} /> Nova receita</span></Button>}
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
              <p className="tnum mt-1 text-2xl font-extrabold">{fmtBRL(data.total)}</p>
            </Card>
            <Card>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mut">Recebido</p>
              <p className="tnum mt-1 text-2xl font-extrabold text-pos">{fmtBRL(data.recebido)}</p>
            </Card>
            <Card>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mut">Em aberto</p>
              <p className="tnum mt-1 text-2xl font-extrabold text-warn">{fmtBRL(data.emAberto)}</p>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card hover={false}>
              <SectionTitle>Evolução das receitas no período</SectionTitle>
              {serie.length > 1 ? (
                <TimeSeriesLine data={serie} series={[{ key: 'value', name: 'Receitas', color: C.accent }]} height={250} />
              ) : (
                <EmptyState title="Poucos pontos para desenhar a evolução" hint="Lance receitas em datas diferentes do período." />
              )}
            </Card>
            <Card hover={false}>
              <SectionTitle>Por categoria / fonte</SectionTitle>
              {data.porCategoria.length === 0 ? (
                <EmptyState title="Sem receitas no período" />
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
                      <ProgressBar pct={c.pct} color={C.accent} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card hover={false}>
            <SectionTitle>Lançamentos ({data.itens.length})</SectionTitle>
            {data.itens.length === 0 ? (
              <EmptyState title="Nenhuma receita no período" hint="Use o botão “Nova receita” para lançar contas a receber." />
            ) : (
              <Table columns={['Vencimento', 'Cliente', 'Categoria', 'Descrição', 'Status', 'Pagamento', 'Origem', 'Valor', '']}>
                {data.itens.map((r) => (
                  <Tr key={r.id}>
                    <Td>{fmtDateISO(r.vencimento)}</Td>
                    <Td>{r.cliente?.name ?? '—'}</Td>
                    <Td>{r.categoria}</Td>
                    <Td className="max-w-[220px] truncate text-mut">{r.descricao ?? '—'}</Td>
                    <Td><Badge text={r.status} color={STATUS_COLOR[r.status] ?? C.mut} /></Td>
                    <Td>{fmtDateISO(r.pagamento)}</Td>
                    <Td><SourceBadge source={r.source} /></Td>
                    <Td right>{fmtBRL(r.valor)}</Td>
                    <Td right>
                      <span className="inline-flex items-center gap-1">
                        {r.status !== 'PAGA' && r.status !== 'CANCELADA' && (
                          <button
                            title="Marcar como paga (hoje)"
                            onClick={() => markPaid(r.id)}
                            className="rounded-md p-1.5 text-mut transition-colors hover:bg-pos/10 hover:text-pos"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                        <button
                          title="Excluir"
                          onClick={() => remove(r.id)}
                          className="rounded-md p-1.5 text-mut transition-colors hover:bg-neg/10 hover:text-neg"
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </Td>
                  </Tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      <Modal title="Nova receita" open={open} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Categoria / fonte">
            <TextInput
              list="categorias-receita"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Ex.: Assinaturas, Serviços, Licenças"
            />
            <datalist id="categorias-receita">
              {data?.porCategoria.map((c) => <option key={c.categoria} value={c.categoria} />)}
            </datalist>
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
            <Field label="Vencimento">
              <TextInput type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {(catalogos?.receivableStatus ?? ['PENDENTE', 'PAGA', 'ATRASADA', 'CANCELADA']).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Data de pagamento">
              <TextInput type="date" value={form.paidDate} onChange={(e) => setForm({ ...form, paidDate: e.target.value })} />
            </Field>
          </div>
          <Field label="Cliente (para o score de inadimplência)">
            <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">— sem cliente —</option>
              {catalogos?.clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          {formError && <p className="text-xs text-neg">{formError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving || !form.amount || !form.dueDate}>
              {saving ? 'Salvando…' : 'Salvar receita'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
