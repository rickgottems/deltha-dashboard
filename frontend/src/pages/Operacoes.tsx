import { useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3, Gauge, Plus, Trash2 } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { currentYm, fmtDateISO, fmtPct, todayISO } from '../lib/format';
import { C } from '../lib/palette';
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Modal, PageHeader,
  SectionTitle, Select, Spinner, Table, Td, TextInput, Tr,
} from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { MonthPicker } from '../components/pickers';
import { ChartLegend, HBars, TimeSeriesLine, type LineSeriesDef } from '../components/charts';

interface OperacoesData {
  month: string;
  kpis: {
    produtividadeMedia: { value: number | null; varPp: number | null };
    prazoMedioDias: { value: number | null; varDias: number | null };
    pctNoPrazo: { value: number | null; varPp: number | null };
    pctAtrasado: { value: number | null; varPp: number | null };
  };
  equipes: { id: string; nome: string; produtividade: number | null; tarefas: number }[];
  serie: { label: string; noPrazo: number | null; atrasado: number | null }[];
  gargalos: { motivo: string; quantidade: number }[];
  totalTarefas: number;
}

interface TaskRow {
  id: string;
  titulo: string;
  equipe: { id: string; name: string } | null;
  prazo: string;
  entrega: string | null;
  status: string;
  motivoAtraso: string | null;
}

const SERIE_DEF: LineSeriesDef[] = [
  { key: 'noPrazo', name: 'No prazo', color: C.pos },
  { key: 'atrasado', name: 'Atrasado', color: C.neg },
];

const emptyTask = { title: '', teamId: '', dueDate: todayISO(), deliveredDate: '', delayReason: '' };

export function Operacoes() {
  const [ym, setYm] = useState(currentYm());
  const { data, loading, error, reload } = useFetch<OperacoesData>(`/api/operacoes/summary?month=${ym}`);
  const { data: tasks, reload: reloadTasks } = useFetch<TaskRow[]>(`/api/operacoes/tasks?month=${ym}`);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyTask);
  const [teamName, setTeamName] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const refreshAll = () => {
    reload();
    reloadTasks();
  };

  const submit = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/api/operacoes/tasks', {
        title: form.title,
        teamId: form.teamId || undefined,
        dueDate: form.dueDate,
        deliveredDate: form.deliveredDate || undefined,
        delayReason: form.delayReason || undefined,
      });
      setOpen(false);
      setForm(emptyTask);
      refreshAll();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addTeam = async () => {
    if (!teamName.trim()) return;
    await api.post('/api/operacoes/teams', { name: teamName.trim() });
    setTeamName('');
    refreshAll();
  };

  const deliverToday = async (t: TaskRow) => {
    const isLate = todayISO() > t.prazo;
    let reason: string | null = null;
    if (isLate) {
      reason = prompt('Tarefa entregue após o prazo. Motivo do atraso (gargalo):', t.motivoAtraso ?? '');
      if (reason === null) return;
    }
    await api.put(`/api/operacoes/tasks/${t.id}`, {
      deliveredDate: todayISO(),
      ...(reason ? { delayReason: reason } : {}),
    });
    refreshAll();
  };

  const removeTask = async (t: TaskRow) => {
    if (!confirm(`Excluir a tarefa "${t.titulo}"?`)) return;
    await api.del(`/api/operacoes/tasks/${t.id}`);
    refreshAll();
  };

  const prodColor = (v: number) => (v >= 90 ? C.pos : v >= 70 ? C.warn : C.neg);

  return (
    <>
      <PageHeader
        title="Operações"
        subtitle="Produtividade, prazos de entrega e gargalos"
        right={
          <div className="flex items-center gap-2">
            <MonthPicker ym={ym} onChange={setYm} />
            <Button onClick={() => setOpen(true)}><span className="inline-flex items-center gap-1.5"><Plus size={13} /> Nova tarefa</span></Button>
          </div>
        }
      />

      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Produtividade média das equipes"
              icon={Gauge}
              value={data.kpis.produtividadeMedia.value}
              formatter={(v) => fmtPct(v, 0)}
              delta={undefined}
              emptyHint="Sem tarefas no mês"
              footer={<p className="text-[10px] text-mut">% de tarefas encerradas dentro do prazo, média entre equipes</p>}
            />
            <KpiCard
              title="Prazo médio de entrega"
              icon={CalendarClock}
              value={data.kpis.prazoMedioDias.value}
              formatter={(v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`}
              delta={data.kpis.prazoMedioDias.varDias}
              deltaSuffix=" dia(s)"
              invertDelta
              emptyHint="Sem entregas no mês"
            />
            <KpiCard
              title="No prazo"
              icon={CheckCircle2}
              value={data.kpis.pctNoPrazo.value}
              formatter={(v) => fmtPct(v, 0)}
              delta={data.kpis.pctNoPrazo.varPp}
              deltaSuffix=" p.p."
              emptyHint="Sem tarefas encerradas"
            />
            <KpiCard
              title="Atrasado"
              icon={Clock3}
              value={data.kpis.pctAtrasado.value}
              formatter={(v) => fmtPct(v, 0)}
              delta={data.kpis.pctAtrasado.varPp}
              deltaSuffix=" p.p."
              invertDelta
              emptyHint="Sem tarefas encerradas"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card hover={false}>
              <SectionTitle right={<ChartLegend series={SERIE_DEF} />}>No prazo x Atrasado (%) — evolução mensal</SectionTitle>
              <TimeSeriesLine data={data.serie} series={SERIE_DEF} height={250} money={false} />
            </Card>
            <Card hover={false}>
              <SectionTitle>Produtividade por equipe (%)</SectionTitle>
              {data.equipes.length === 0 ? (
                <EmptyState title="Nenhuma equipe cadastrada" hint="Adicione equipes abaixo e vincule tarefas a elas." />
              ) : (
                <HBars
                  data={data.equipes.filter((e) => e.produtividade !== null).map((e) => ({ name: e.nome, value: e.produtividade ?? 0 }))}
                  suffix="%"
                  colorByValue={prodColor}
                />
              )}
              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                <TextInput
                  placeholder="Nova equipe…"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
                <Button variant="ghost" onClick={addTeam} disabled={!teamName.trim()}>Adicionar</Button>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card hover={false}>
              <SectionTitle>Gargalos — tarefas em atraso por motivo</SectionTitle>
              {data.gargalos.length === 0 ? (
                <EmptyState title="Nenhum atraso no mês" hint="Ótimo sinal — nada em atraso no período." />
              ) : (
                <HBars data={data.gargalos.map((g) => ({ name: g.motivo, value: g.quantidade }))} color={C.neg} />
              )}
            </Card>

            <Card hover={false}>
              <SectionTitle>Tarefas do mês ({tasks?.length ?? 0})</SectionTitle>
              {(tasks ?? []).length === 0 ? (
                <EmptyState title="Nenhuma tarefa no mês" hint="Crie tarefas com prazo para alimentar os indicadores." />
              ) : (
                <div className="max-h-[340px] overflow-y-auto">
                  <Table columns={['Prazo', 'Tarefa', 'Equipe', 'Status', '']}>
                    {(tasks ?? []).map((t) => {
                      const late =
                        (t.entrega && t.entrega > t.prazo) || (!t.entrega && todayISO() > t.prazo && t.status !== 'CANCELADA');
                      return (
                        <Tr key={t.id}>
                          <Td>{fmtDateISO(t.prazo)}</Td>
                          <Td>
                            <div className="font-medium">{t.titulo}</div>
                            {t.motivoAtraso && <div className="text-[10px] text-neg">{t.motivoAtraso}</div>}
                          </Td>
                          <Td>{t.equipe?.name ?? '—'}</Td>
                          <Td>
                            <Badge
                              text={t.status === 'CONCLUIDA' ? (late ? 'CONCLUÍDA (ATRASO)' : 'CONCLUÍDA') : late ? 'VENCIDA' : 'EM ANDAMENTO'}
                              color={t.status === 'CONCLUIDA' ? (late ? C.warn : C.pos) : late ? C.neg : C.silver}
                            />
                          </Td>
                          <Td right>
                            <span className="inline-flex gap-1">
                              {t.status !== 'CONCLUIDA' && (
                                <button
                                  title="Marcar entregue hoje"
                                  onClick={() => deliverToday(t)}
                                  className="rounded-md p-1.5 text-mut transition-colors hover:bg-pos/10 hover:text-pos"
                                >
                                  <CheckCircle2 size={13} />
                                </button>
                              )}
                              <button
                                title="Excluir"
                                onClick={() => removeTask(t)}
                                className="rounded-md p-1.5 text-mut transition-colors hover:bg-neg/10 hover:text-neg"
                              >
                                <Trash2 size={13} />
                              </button>
                            </span>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Table>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      <Modal title="Nova tarefa" open={open} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Título">
            <TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Equipe">
              <Select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                <option value="">— sem equipe —</option>
                {data?.equipes.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </Select>
            </Field>
            <Field label="Prazo">
              <TextInput type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Entrega (se já concluída)">
              <TextInput type="date" value={form.deliveredDate} onChange={(e) => setForm({ ...form, deliveredDate: e.target.value })} />
            </Field>
            <Field label="Motivo do atraso (se houver)">
              <TextInput
                list="motivos-atraso"
                value={form.delayReason}
                onChange={(e) => setForm({ ...form, delayReason: e.target.value })}
                placeholder="Ex.: Aprovação do cliente"
              />
              <datalist id="motivos-atraso">
                {data?.gargalos.map((g) => <option key={g.motivo} value={g.motivo} />)}
              </datalist>
            </Field>
          </div>
          {formError && <p className="text-xs text-neg">{formError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving || !form.title.trim() || !form.dueDate}>
              {saving ? 'Salvando…' : 'Criar tarefa'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
