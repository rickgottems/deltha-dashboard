// Avaliação de alertas por limiares CONFIGURÁVEIS (tabela alert_thresholds,
// editável em Configurações → Alertas). Nenhuma regra é hardcoded aqui:
// este módulo só compara valor × limiar × direção.

import { prisma } from '../db.js';
import { contributionMarginAvg, goalFor, inadimplencia, monthFinance } from './finance.js';

export type AlertLevel = 'critico' | 'atencao' | 'confortavel';

export interface Alert {
  metricKey: string;
  label: string;
  level: AlertLevel;
  value: number;
  unit: string;
  yellowThreshold: number;
  redThreshold: number;
  direction: string;
  message: string;
}

/**
 * Classificação genérica valor×limiar×direção — reaproveitada por
 * services/healthScore.ts para as regras de Balanço/DFC (mesmo motor,
 * mesma tabela alert_thresholds, ver deltha-motor-regras-financeiras na memória).
 */
export function classify(
  value: number,
  yellow: number,
  red: number,
  direction: string
): AlertLevel {
  if (direction === 'ABOVE') {
    if (value >= red) return 'critico';
    if (value >= yellow) return 'atencao';
    return 'confortavel';
  }
  // BELOW: valor baixo é ruim
  if (value <= red) return 'critico';
  if (value <= yellow) return 'atencao';
  return 'confortavel';
}

export function fmt(value: number, unit: string): string {
  if (unit === 'R$')
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const spaced = unit === '%' || unit === 'x' ? '' : ' ';
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${spaced}${unit}`;
}

/** Calcula o valor atual de cada métrica com regra cadastrada e classifica. */
export async function evaluateAlerts(ym: string, scope: 'executivo' | 'financeiro', companyId: string): Promise<Alert[]> {
  const thresholds = await prisma.alertThreshold.findMany({
    where: { companyId, scope: { in: [scope, 'ambos'] } },
  });
  if (thresholds.length === 0) return [];

  const f = await monthFinance(ym, companyId);
  const values: Record<string, number | null> = {
    margem_liquida: f.margemLiquida,
    margem_ebitda: f.margemEbitda,
    fluxo_caixa: f.fluxoCaixa,
    comprometimento_receita: f.receitaBruta > 0 ? (f.despesasTotais / f.receitaBruta) * 100 : null,
  };

  if (thresholds.some((t) => t.metricKey === 'inadimplencia')) {
    values['inadimplencia'] = await inadimplencia(companyId);
  }
  if (thresholds.some((t) => t.metricKey === 'atingimento_meta_receita')) {
    const meta = await goalFor('receita_total', ym, companyId);
    values['atingimento_meta_receita'] = meta && meta > 0 ? (f.receitaBruta / meta) * 100 : null;
  }
  if (thresholds.some((t) => t.metricKey === 'margem_contribuicao')) {
    values['margem_contribuicao'] = (await contributionMarginAvg(companyId)).avg;
  }

  const alerts: Alert[] = [];
  for (const t of thresholds) {
    const value = values[t.metricKey];
    if (value === null || value === undefined) continue; // sem dado suficiente → sem alerta
    const level = classify(value, t.yellowThreshold, t.redThreshold, t.direction);
    const compare =
      t.direction === 'ABOVE'
        ? level === 'confortavel'
          ? `abaixo do limite de ${fmt(t.yellowThreshold, t.unit)}`
          : `acima do limite de ${fmt(level === 'critico' ? t.redThreshold : t.yellowThreshold, t.unit)}`
        : level === 'confortavel'
          ? `acima do mínimo de ${fmt(t.yellowThreshold, t.unit)}`
          : `abaixo do mínimo de ${fmt(level === 'critico' ? t.redThreshold : t.yellowThreshold, t.unit)}`;
    alerts.push({
      metricKey: t.metricKey,
      label: t.label,
      level,
      value,
      unit: t.unit,
      yellowThreshold: t.yellowThreshold,
      redThreshold: t.redThreshold,
      direction: t.direction,
      message: `${t.label} em ${fmt(value, t.unit)} — ${compare}.`,
    });
  }

  const order: Record<AlertLevel, number> = { critico: 0, atencao: 1, confortavel: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}
