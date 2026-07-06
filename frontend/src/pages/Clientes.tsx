import { useMemo, useState } from 'react';
import { Info, Pencil, Plus, Search, Trash2, Trophy } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { fmtBRL, fmtDateISO, fmtNum } from '../lib/format';
import { C, RISK_COLOR, RISK_LABEL } from '../lib/palette';
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Modal, PageHeader,
  SectionTitle, Spinner, Table, Td, TextInput, Tr,
} from '../components/ui';

interface ClienteRow {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  desde: string;
  totalComprado: number;
  compras: number;
  ultimaCompra: string | null;
  risco: {
    level: string;
    pctAtraso: number | null;
    mediaDiasAtraso: number | null;
    totalFaturas: number;
    faturasAtrasadas: number;
    valorEmAberto: number;
  };
}

interface RankingRow {
  posicao: number;
  cliente: string;
  total: number;
  compras: number;
}

const emptyForm = { id: '', name: '', email: '', phone: '' };

export function Clientes() {
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (riskFilter) p.set('risk', riskFilter);
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [search, riskFilter]);

  const { data, loading, error, reload } = useFetch<ClienteRow[]>(`/api/clientes${query}`);
  const { data: ranking } = useFetch<RankingRow[]>('/api/clientes/ranking');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (form.id) {
        await api.put(`/api/clientes/${form.id}`, { name: form.name, email: form.email, phone: form.phone });
      } else {
        await api.post('/api/clientes', { name: form.name, email: form.email || undefined, phone: form.phone || undefined });
      }
      setOpen(false);
      setForm(emptyForm);
      reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: ClienteRow) => {
    if (!confirm(`Excluir o cliente "${c.nome}"? Vendas e cobranças dele ficam sem vínculo.`)) return;
    await api.del(`/api/clientes/${c.id}`);
    reload();
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle="Base de clientes, ranking de compradores e risco de inadimplência"
        right={
          <Button onClick={() => { setForm(emptyForm); setOpen(true); }}>
            <span className="inline-flex items-center gap-1.5"><Plus size={13} /> Novo cliente</span>
          </Button>
        }
      />

      {/* Filtros básicos */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mut" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="w-64 rounded-lg border border-line bg-panel py-2 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-mut/60 focus:border-accent/60"
          />
        </div>
        <div className="flex overflow-hidden rounded-lg border border-line">
          {[
            { key: '', label: 'Todos' },
            { key: 'BAIXO', label: 'Baixo risco' },
            { key: 'MEDIO', label: 'Médio' },
            { key: 'ALTO', label: 'Alto' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setRiskFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                riskFilter === f.key ? 'bg-accent/15 text-accent' : 'bg-panel text-mut hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && !loading && (
        <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
          <Card hover={false}>
            <SectionTitle
              right={
                <span className="inline-flex items-center gap-1 text-[10px] text-mut">
                  <Info size={11} />
                  Score = heurística v1 sobre o histórico de cobranças (12 meses), não é modelo preditivo
                </span>
              }
            >
              Lista de clientes ({data.length})
            </SectionTitle>
            {data.length === 0 ? (
              <EmptyState title="Nenhum cliente encontrado" hint="Cadastre clientes ou ajuste os filtros." />
            ) : (
              <Table columns={['Cliente', 'Desde', 'Compras', 'Total comprado', 'Última compra', 'Atraso', 'Risco', '']}>
                {data.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-[11px] text-mut">{c.email ?? '—'}</div>
                    </Td>
                    <Td>{fmtDateISO(c.desde)}</Td>
                    <Td right>{fmtNum(c.compras)}</Td>
                    <Td right className="font-semibold">{fmtBRL(c.totalComprado)}</Td>
                    <Td>{fmtDateISO(c.ultimaCompra)}</Td>
                    <Td>
                      {c.risco.pctAtraso === null ? (
                        <span className="text-xs text-mut">—</span>
                      ) : (
                        <div className="text-xs">
                          <span className="tnum font-semibold">{c.risco.pctAtraso.toFixed(0)}%</span>
                          <span className="text-mut"> · {Math.round(c.risco.mediaDiasAtraso ?? 0)}d médio</span>
                          {c.risco.valorEmAberto > 0 && (
                            <div className="text-[10px] text-neg">{fmtBRL(c.risco.valorEmAberto)} vencido</div>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <Badge text={RISK_LABEL[c.risco.level] ?? c.risco.level} color={RISK_COLOR[c.risco.level] ?? C.mut} />
                    </Td>
                    <Td right>
                      <span className="inline-flex gap-1">
                        <button
                          title="Editar"
                          onClick={() => {
                            setForm({ id: c.id, name: c.nome, email: c.email ?? '', phone: c.telefone ?? '' });
                            setOpen(true);
                          }}
                          className="rounded-md p-1.5 text-mut transition-colors hover:bg-panel2 hover:text-ink"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          title="Excluir"
                          onClick={() => remove(c)}
                          className="rounded-md p-1.5 text-mut transition-colors hover:bg-neg/10 hover:text-neg"
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    </Td>
                  </Tr>
                ))}
              </Table>
            )}
          </Card>

          <Card hover={false} className="self-start">
            <SectionTitle
              right={<Trophy size={13} className="text-accent" />}
            >
              Melhores compradores (geral)
            </SectionTitle>
            {(ranking ?? []).length === 0 ? (
              <EmptyState title="Sem vendas registradas" />
            ) : (
              <div className="space-y-2">
                {(ranking ?? []).map((r) => (
                  <div key={r.posicao} className="flex items-center gap-3 rounded-lg border border-line bg-panel2/40 px-3 py-2.5">
                    <span className={`tnum w-6 text-center text-sm font-black ${r.posicao <= 3 ? 'text-accent' : 'text-mut'}`}>
                      {r.posicao}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{r.cliente}</div>
                      <div className="text-[11px] text-mut">{r.compras} compra(s)</div>
                    </div>
                    <span className="tnum text-[13px] font-bold">{fmtBRL(r.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal title={form.id ? 'Editar cliente' : 'Novo cliente'} open={open} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Nome">
            <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="E-mail">
            <TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          {formError && <p className="text-xs text-neg">{formError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving || !form.name.trim()}>
              {saving ? 'Salvando…' : 'Salvar cliente'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
