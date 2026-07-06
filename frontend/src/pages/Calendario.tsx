import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarX2, CheckCircle2, ExternalLink, Link2, Unplug } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../lib/api';
import { currentYm, fmtYm } from '../lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { MonthPicker } from '../components/pickers';
import { C } from '../lib/palette';

interface CalendarStatus {
  configured: boolean;
  connected: boolean;
  missingEnvVars: string[];
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  link: string | null;
}

function monthEdges(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

export function Calendario() {
  const [params] = useSearchParams();
  const [ym, setYm] = useState(currentYm());
  const { data: status, loading, error, reload } = useFetch<CalendarStatus>('/api/calendar/status');

  const edges = monthEdges(ym);
  const eventsUrl = status?.connected ? `/api/calendar/events?from=${edges.from}&to=${edges.to}` : '';
  const events = useFetch<CalendarEvent[]>(eventsUrl || '/api/health'); // health = no-op enquanto desconectado

  const justConnected = params.get('connected') === '1';
  const oauthError = params.get('error');

  const connect = async () => {
    const { url } = await api.get<{ url: string }>('/api/calendar/auth-url');
    window.location.href = url;
  };

  const disconnect = async () => {
    if (!confirm('Desconectar o Google Calendar?')) return;
    await api.post('/api/calendar/disconnect', {});
    reload();
  };

  const grouped = useMemo(() => {
    if (!status?.connected || !Array.isArray(events.data)) return [];
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events.data as CalendarEvent[]) {
      const day = (e.start ?? '').slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), e]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [events.data, status?.connected]);

  return (
    <>
      <PageHeader
        title="Calendário"
        subtitle="Agenda integrada ao Google Calendar"
        right={status?.connected ? <MonthPicker ym={ym} onChange={setYm} /> : undefined}
      />

      {justConnected && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-pos/40 bg-pos/10 px-4 py-3 text-sm text-pos">
          <CheckCircle2 size={16} /> Google Calendar conectado com sucesso.
        </div>
      )}
      {oauthError && (
        <div className="mb-4 rounded-lg border border-neg/40 bg-neg/10 px-4 py-3 text-sm text-neg">
          Falha na conexão: {oauthError}
        </div>
      )}

      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {status && !loading && !status.configured && (
        <Card hover={false}>
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-panel2 text-mut">
              <CalendarX2 size={26} strokeWidth={1.6} />
            </span>
            <div>
              <h2 className="text-base font-bold">Google Calendar não conectado</h2>
              <p className="mx-auto mt-1 max-w-lg text-sm leading-relaxed text-mut">
                A integração depende de credenciais OAuth do Google Cloud que ainda não foram configuradas.
                Nenhuma outra aba do sistema depende desta integração.
              </p>
            </div>
            <div className="w-full max-w-xl rounded-lg border border-line bg-panel2/50 p-4 text-left text-xs leading-relaxed text-mut">
              <p className="mb-2 font-bold uppercase tracking-wider text-ink">Como ativar (fora do código):</p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>Criar um projeto no <span className="text-ink">Google Cloud Console</span></li>
                <li>Ativar a <span className="text-ink">Google Calendar API</span></li>
                <li>Configurar a tela de consentimento OAuth</li>
                <li>Criar credencial <span className="text-ink">OAuth Client ID</span> (Web) com redirect URI <code className="text-accent">http://localhost:3001/api/calendar/callback</code></li>
                <li>Preencher no arquivo <code className="text-accent">backend/.env</code> e reiniciar o backend</li>
              </ol>
              <p className="mt-3 font-bold uppercase tracking-wider text-ink">Variáveis ausentes:</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {status.missingEnvVars.map((v) => (
                  <Badge key={v} text={v} color={C.warn} />
                ))}
              </div>
            </div>
            <Button onClick={reload} variant="ghost">Verificar novamente</Button>
          </div>
        </Card>
      )}

      {status && !loading && status.configured && !status.connected && (
        <Card hover={false}>
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <Link2 size={26} strokeWidth={1.6} />
            </span>
            <div>
              <h2 className="text-base font-bold">Credenciais configuradas — falta conectar</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-mut">
                Autorize o acesso de leitura à sua agenda Google para ver os eventos aqui.
              </p>
            </div>
            <Button onClick={connect}>Conectar Google Calendar</Button>
          </div>
        </Card>
      )}

      {status && !loading && status.connected && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs text-pos">
              <CheckCircle2 size={14} /> Conectado ao Google Calendar
            </span>
            <button onClick={disconnect} className="inline-flex items-center gap-1.5 text-xs text-mut transition-colors hover:text-neg">
              <Unplug size={13} /> Desconectar
            </button>
          </div>

          <Card hover={false}>
            <SectionTitle>Eventos — {fmtYm(ym)}</SectionTitle>
            {events.loading && <Spinner />}
            {events.error && <ErrorState message={events.error} onRetry={events.reload} />}
            {!events.loading && grouped.length === 0 && (
              <EmptyState title="Nenhum evento no mês" />
            )}
            <div className="space-y-4">
              {grouped.map(([day, list]) => (
                <div key={day}>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-accent">
                    {new Date(`${day}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </p>
                  <div className="space-y-1.5">
                    {list.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel2/40 px-3 py-2.5">
                        <span className="tnum w-14 shrink-0 text-xs font-semibold text-mut">
                          {e.allDay ? 'Dia todo' : (e.start ?? '').slice(11, 16)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{e.title}</p>
                          {e.location && <p className="truncate text-[11px] text-mut">{e.location}</p>}
                        </div>
                        {e.link && (
                          <a href={e.link} target="_blank" rel="noreferrer" className="text-mut transition-colors hover:text-accent">
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
