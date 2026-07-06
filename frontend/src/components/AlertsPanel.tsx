import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, OctagonAlert } from 'lucide-react';
import { Badge, Card, EmptyState, SectionTitle } from './ui';
import { LEVEL_COLOR, LEVEL_LABEL, type AlertLevel } from '../lib/palette';

export interface AlertItem {
  metricKey: string;
  label: string;
  level: AlertLevel;
  message: string;
}

const ICON = {
  critico: OctagonAlert,
  atencao: AlertTriangle,
  confortavel: CheckCircle2,
} as const;

/**
 * Painel de alertas com sistema de 3 cores. As regras (limiares) são
 * configuráveis em Configurações → Alertas — nada é fixo no componente.
 */
export function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  return (
    <Card hover={false}>
      <SectionTitle
        right={
          <Link to="/configuracoes?tab=alertas" className="text-[11px] font-semibold text-accent hover:underline">
            Configurar regras
          </Link>
        }
      >
        Alertas
      </SectionTitle>
      {alerts.length === 0 ? (
        <EmptyState
          title="Nenhuma regra avaliável no período"
          hint="Sem dados suficientes para avaliar as regras de alerta, ou nenhuma regra cadastrada em Configurações → Alertas."
        />
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => {
            const color = LEVEL_COLOR[a.level];
            const Icon = ICON[a.level];
            return (
              <div
                key={a.metricKey}
                className="flex items-start gap-3 rounded-lg border border-line bg-panel2/40 p-3"
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <Icon size={16} style={{ color }} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">{a.label}</span>
                    <Badge text={LEVEL_LABEL[a.level]} color={color} />
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-mut">{a.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
