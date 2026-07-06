import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeDollarSign, Plus, Target, Ticket, Users } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { currentYm, fmtBRL, fmtBRLCompact, fmtNum, fmtYm, todayISO } from '../lib/format';
import { C } from '../lib/palette';
import {
  Button, Card, EmptyState, ErrorState, Field, Modal, PageHeader,
  ProgressBar, SectionTitle, Select, Spinner, Table, Td, TextInput, Tr,
} from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { MonthPicker } from '../components/pickers';
import { TimeSeriesLine } from '../components/charts';
import { useCountUp } from '../hooks/useCountUp';

interface VendasData {
  month: string;
  kpis: {
    faturamento: { value: number; varPct: number | null };
    meta: { value: number | null; atingidoPct: number | null; restantePct: number | null; restanteValor: number | null };
    ticketMedio: { value: number | null; varPct: number | null };
    clientesAtivos: { value: number };
  };
  ranking: { posicao: number; cliente: string; total: number; compras: number }[];
  maisVendidos: { posicao: number; produto: string; faturamento: number; quantidade: number }[];
  evolucao: { label: string; valor: number }[];
}

interface Catalogos {
  clients: { id: string; name: string }[];
  products: { id: string; name: string; salePrice: number }[];
  sellers: { id: string; name: string }[];
}

const emptyForm = { productId: '', clientId: '', sellerId: '', quantity: '1', amount: '', date: todayISO() };

function MetaCard({ meta }: { meta: VendasData['kpis']['meta'] }) {
  const animated = useCountUp(meta.atingidoPct ?? 0);
  if (meta.value === null) {
    return (
      <Card className="flex min-h-[132px] flex-col justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/12 text-accent"><Target size={13} /></span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mut">Meta do mês</span>
        </div>
        <p className="text-sm text-mut">
          Nenhuma meta configurada.{' '}
          <Link to="/configuracoes?tab=metas" className="font-semibold text-accent hover:underline">
            Definir meta
          </Link>
        </p>
      </Card>
    );
  }
  const pct = meta.atingidoPct ?? 0;
  const color = pct >= 100 ? C.pos : pct >= 70 ? C.accent : C.neg;
  return (
    <Card className="flex min-h-[132px] flex-col justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/12 text-accent"><Target size={13} /></span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mut">Meta do mês</span>
      </div>
      <div>
        <div className="tnum text-[26px] font-extrabold leading-tight">{fmtBRLCompact(meta.value)}</div>
        <p className="mt-0.5 text-xs text-mut">
          Faltam <span className="tnum font-semibold text-ink">{fmtBRLCompact(meta.restanteValor ?? 0)}</span> ·{' '}
          <span className="tnum">{(meta.restantePct ?? 0).toFixed(0)}% restante</span>
        </p>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[10px] text-mut">
          <span>Atingido</span>
          <span className="tnum font-bold" style={{ color }}>{animated.toFixed(0)}%</span>
        </div>
        <ProgressBar pct={pct} color={color} />
      </div>
    </Card>
  );
}

export function Vendas() {
  const [ym, setYm] = useState(currentYm());
  const { data, loading, error, reload } = useFetch<VendasData>(`/api/vendas/summary?month=${ym}`);
  const { data: catalogos } = useFetch<Catalogos>('/api/config/catalogos');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/api/vendas', {
        productId: form.productId || undefined,
        clientId: form.clientId || undefined,
        sellerId: form.sellerId || undefined,
        quantity: Number(form.quantity) || 1,
        amount: form.amount === '' ? undefined : Number(form.amount),
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

  return (
    <>
      <PageHeader
        title="Vendas"
        subtitle="Faturamento, metas, ranking e produtos campeões"
        right={
          <div className="flex items-center gap-2">
            <MonthPicker ym={ym} onChange={setYm} />
            <Button onClick={() => setOpen(true)}><span className="inline-flex items-center gap-1.5"><Plus size={13} /> Nova venda</span></Button>
          </div>
        }
      />

      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Faturamento do mês"
              icon={BadgeDollarSign}
              value={data.kpis.faturamento.value}
              formatter={fmtBRLCompact}
              delta={data.kpis.faturamento.varPct}
            />
            <MetaCard meta={data.kpis.meta} />
            <KpiCard
              title="Ticket médio"
              icon={Ticket}
              value={data.kpis.ticketMedio.value}
              formatter={(v) => fmtBRL(v)}
              delta={data.kpis.ticketMedio.varPct}
              emptyHint="Sem vendas no mês"
            />
            <KpiCard
              title="Clientes ativos (90 dias)"
              icon={Users}
              value={data.kpis.clientesAtivos.value}
              formatter={(v) => fmtNum(v)}
              delta={undefined}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card hover={false}>
              <SectionTitle>Ranking de melhores compradores — {fmtYm(data.month)}</SectionTitle>
              {data.ranking.length === 0 ? (
                <EmptyState title="Sem vendas com cliente no mês" />
              ) : (
                <Table columns={['#', 'Cliente', 'Compras', 'Total']} align={['left', 'left', 'right', 'right']}>
                  {data.ranking.map((r) => (
                    <Tr key={r.posicao}>
                      <Td className="w-8 font-bold text-accent">{r.posicao}</Td>
                      <Td>{r.cliente}</Td>
                      <Td right>{r.compras}</Td>
                      <Td right className="font-semibold">{fmtBRL(r.total)}</Td>
                    </Tr>
                  ))}
                </Table>
              )}
            </Card>

            <Card hover={false}>
              <SectionTitle>Produtos mais vendidos — {fmtYm(data.month)}</SectionTitle>
              {data.maisVendidos.length === 0 ? (
                <EmptyState title="Sem vendas no mês" />
              ) : (
                <Table columns={['#', 'Produto', 'Quantidade', 'Faturamento']} align={['left', 'left', 'right', 'right']}>
                  {data.maisVendidos.map((p) => (
                    <Tr key={p.posicao}>
                      <Td className="w-8 font-bold text-accent">{p.posicao}</Td>
                      <Td>{p.produto}</Td>
                      <Td right>{fmtNum(p.quantidade)}</Td>
                      <Td right className="font-semibold">{fmtBRL(p.faturamento)}</Td>
                    </Tr>
                  ))}
                </Table>
              )}
            </Card>
          </div>

          <Card hover={false}>
            <SectionTitle>Evolução mensal de vendas — últimos 12 meses</SectionTitle>
            <TimeSeriesLine data={data.evolucao} series={[{ key: 'valor', name: 'Faturamento', color: C.accent }]} height={260} />
          </Card>
        </div>
      )}

      <Modal title="Nova venda" open={open} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Produto">
            <Select
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            >
              <option value="">— selecionar —</option>
              {catalogos?.products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({fmtBRL(p.salePrice)})</option>
              ))}
            </Select>
          </Field>
          {(catalogos?.products.length ?? 0) === 0 && (
            <p className="text-[11px] text-mut">
              Nenhum produto cadastrado —{' '}
              <Link to="/configuracoes?tab=produtos" className="text-accent hover:underline">cadastrar produtos</Link>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cliente">
              <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                <option value="">— sem cliente —</option>
                {catalogos?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Vendedor">
              <Select value={form.sellerId} onChange={(e) => setForm({ ...form, sellerId: e.target.value })}>
                <option value="">— sem vendedor —</option>
                {catalogos?.sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Quantidade">
              <TextInput type="number" min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </Field>
            <Field label="Valor total (R$)">
              <TextInput
                type="number" min="0" step="0.01"
                placeholder="auto pelo produto"
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
            <Button onClick={submit} disabled={saving || !form.date || (!form.productId && form.amount === '')}>
              {saving ? 'Salvando…' : 'Registrar venda'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
