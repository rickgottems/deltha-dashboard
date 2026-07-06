// ============================================================
// SCORE DE RISCO DE INADIMPLÊNCIA — HEURÍSTICA v1 (NÃO é machine learning)
//
// Regra determinística e auditável sobre o histórico de cobranças do
// cliente (tabela receivables: client_id, due_date, paid_date, amount,
// status) nos últimos 12 meses:
//
//   pctAtraso      = (faturas pagas com atraso + faturas vencidas em aberto)
//                    ÷ total de faturas do período
//   mediaDiasAtraso = média dos dias de atraso (faturas em aberto vencidas
//                     contam os dias corridos até hoje)
//
// Classificação (cores semânticas padrão do sistema):
//   ALTO   (vermelho)  se pctAtraso ≥ 50%  OU  mediaDiasAtraso > 15
//   MEDIO  (amarelo)   se pctAtraso ≥ 20%  OU  mediaDiasAtraso > 5
//   BAIXO  (verde)     caso contrário
//   SEM_HISTORICO      cliente sem faturas no período (neutro)
//
// Este é intencionalmente um modelo de REGRAS (v1). Não evoluir para
// "IA preditiva"/ML sem decisão explícita do negócio.
// ============================================================

import { prisma } from '../db.js';

export type RiskLevel = 'BAIXO' | 'MEDIO' | 'ALTO' | 'SEM_HISTORICO';

export interface ClientRisk {
  level: RiskLevel;
  pctAtraso: number | null;
  mediaDiasAtraso: number | null;
  totalFaturas: number;
  faturasAtrasadas: number;
  valorEmAberto: number;
}

const DAY = 24 * 60 * 60 * 1000;

export function computeRisk(
  receivables: { dueDate: Date; paidDate: Date | null; status: string; amount: number }[],
  now = new Date()
): ClientRisk {
  const valid = receivables.filter((r) => r.status !== 'CANCELADA');
  if (valid.length === 0) {
    return {
      level: 'SEM_HISTORICO',
      pctAtraso: null,
      mediaDiasAtraso: null,
      totalFaturas: 0,
      faturasAtrasadas: 0,
      valorEmAberto: 0,
    };
  }

  let late = 0;
  let delayDaysSum = 0;
  let delayCount = 0;
  let valorEmAberto = 0;

  for (const r of valid) {
    if (r.status === 'PAGA' && r.paidDate) {
      const delay = Math.floor((r.paidDate.getTime() - r.dueDate.getTime()) / DAY);
      if (delay > 0) {
        late++;
        delayDaysSum += delay;
        delayCount++;
      }
    } else if (r.dueDate.getTime() < now.getTime()) {
      // vencida e não paga: conta como atraso corrente
      late++;
      delayDaysSum += Math.floor((now.getTime() - r.dueDate.getTime()) / DAY);
      delayCount++;
      valorEmAberto += r.amount;
    }
  }

  const pctAtraso = (late / valid.length) * 100;
  const mediaDiasAtraso = delayCount > 0 ? delayDaysSum / delayCount : 0;

  let level: RiskLevel = 'BAIXO';
  if (pctAtraso >= 50 || mediaDiasAtraso > 15) level = 'ALTO';
  else if (pctAtraso >= 20 || mediaDiasAtraso > 5) level = 'MEDIO';

  return {
    level,
    pctAtraso,
    mediaDiasAtraso,
    totalFaturas: valid.length,
    faturasAtrasadas: late,
    valorEmAberto,
  };
}

/** Risco de todos os clientes com base nos últimos 12 meses de cobranças. */
export async function riskByClient(): Promise<Map<string, ClientRisk>> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
  const rows = await prisma.receivable.findMany({
    where: { clientId: { not: null }, dueDate: { gte: start } },
    select: { clientId: true, dueDate: true, paidDate: true, status: true, amount: true },
  });
  const byClient = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byClient.get(r.clientId!) ?? [];
    list.push(r);
    byClient.set(r.clientId!, list);
  }
  const out = new Map<string, ClientRisk>();
  for (const [clientId, list] of byClient) out.set(clientId, computeRisk(list, now));
  return out;
}
