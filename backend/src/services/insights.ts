// "Insights" do Executivo: leitura automática dos números via regras
// determinísticas (não é IA generativa). Insight negativo SEMPRE carrega
// uma "Ação recomendada" objetiva.

import {
  expenseAnomaly,
  goalFor,
  inadimplencia,
  monthWithPrev,
  pctChange,
} from './finance.js';
import { prisma } from '../db.js';

export interface Insight {
  tone: 'positivo' | 'negativo' | 'neutro';
  title: string;
  text: string;
  action: string | null; // obrigatória quando tone = negativo
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export async function buildInsights(ym: string, companyId: string): Promise<Insight[]> {
  const { atual, anterior } = await monthWithPrev(ym, companyId);
  const out: Insight[] = [];

  // 1) Receita vs meta configurada (se houver)
  const meta = await goalFor('receita_total', ym, companyId);
  if (meta && meta > 0) {
    const ating = (atual.receitaBruta / meta) * 100;
    if (ating >= 100) {
      out.push({
        tone: 'positivo',
        title: 'Meta de receita batida',
        text: `Receita de ${fmtBRL(atual.receitaBruta)} atingiu ${fmtPct(ating)} da meta (${fmtBRL(meta)}).`,
        action: null,
      });
    } else {
      out.push({
        tone: 'negativo',
        title: 'Receita abaixo da meta',
        text: `Receita de ${fmtBRL(atual.receitaBruta)} representa ${fmtPct(ating)} da meta de ${fmtBRL(meta)}.`,
        action: `Faltam ${fmtBRL(meta - atual.receitaBruta)}. Priorizar propostas em aberto e campanhas de reativação de clientes inativos.`,
      });
    }
  }

  // 2) Receita vs mês anterior
  const varReceita = pctChange(atual.receitaBruta, anterior.receitaBruta);
  if (varReceita !== null && Math.abs(varReceita) >= 1) {
    if (varReceita >= 0) {
      out.push({
        tone: 'positivo',
        title: 'Receita em crescimento',
        text: `Receita ${fmtPct(varReceita)} acima do mês anterior (${fmtBRL(anterior.receitaBruta)} → ${fmtBRL(atual.receitaBruta)}).`,
        action: null,
      });
    } else {
      out.push({
        tone: 'negativo',
        title: 'Receita em queda',
        text: `Receita caiu ${fmtPct(Math.abs(varReceita))} vs mês anterior (${fmtBRL(anterior.receitaBruta)} → ${fmtBRL(atual.receitaBruta)}).`,
        action: 'Investigar as 3 maiores contas do mês anterior que não se repetiram e agir sobre a causa (churn, sazonalidade ou atraso de faturamento).',
      });
    }
  }

  // 3) Margem líquida vs mês anterior (pontos percentuais)
  if (atual.margemLiquida !== null && anterior.margemLiquida !== null) {
    const delta = atual.margemLiquida - anterior.margemLiquida;
    if (delta <= -1) {
      out.push({
        tone: 'negativo',
        title: 'Margem líquida comprimida',
        text: `Margem caiu ${Math.abs(delta).toFixed(1)} p.p. (${fmtPct(anterior.margemLiquida)} → ${fmtPct(atual.margemLiquida)}).`,
        action: 'Revisar as categorias de despesa que mais cresceram no mês e reavaliar preços dos produtos de menor margem de contribuição.',
      });
    } else if (delta >= 1) {
      out.push({
        tone: 'positivo',
        title: 'Margem líquida em expansão',
        text: `Margem subiu ${delta.toFixed(1)} p.p. (${fmtPct(anterior.margemLiquida)} → ${fmtPct(atual.margemLiquida)}). Eficiência operacional melhorando.`,
        action: null,
      });
    }
  }

  // 4) Despesa fora do padrão (categoria > 2× média de 6 meses)
  const anomaly = await expenseAnomaly(ym, companyId);
  if (anomaly) {
    out.push({
      tone: 'negativo',
      title: 'Despesa fora do padrão',
      text: `"${anomaly.category}" somou ${fmtBRL(anomaly.value)} no mês — a média dos últimos 6 meses é ${fmtBRL(anomaly.avg)}.`,
      action: `Confirmar com o financeiro se o gasto em "${anomaly.category}" foi pontual ou virou custo recorrente; renegociar se recorrente.`,
    });
  }

  // 5) Inadimplência relevante
  const inad = await inadimplencia(companyId);
  if (inad !== null && inad >= 3) {
    const abertos = await prisma.receivable.count({
      where: { companyId, status: { notIn: ['PAGA', 'CANCELADA'] }, dueDate: { lt: new Date() } },
    });
    out.push({
      tone: 'negativo',
      title: 'Inadimplência acima do saudável',
      text: `${fmtPct(inad)} do faturamento dos últimos 12 meses está vencido e não pago (${abertos} título(s) em aberto).`,
      action: 'Priorizar cobrança dos títulos vencidos há mais de 30 dias e revisar condições de pagamento dos clientes de risco Alto (aba Clientes).',
    });
  }

  // 6) Fallback informativo quando há poucos sinais
  if (out.length < 3 && atual.receitaBruta > 0 && atual.margemLiquida !== null) {
    out.push({
      tone: 'neutro',
      title: 'Resumo do mês',
      text: `Receita de ${fmtBRL(atual.receitaBruta)} com margem líquida de ${fmtPct(atual.margemLiquida)} e EBITDA de ${fmtBRL(atual.ebitda)}.`,
      action: null,
    });
  }

  // Negativos primeiro (exigem atenção), máximo 4 cards
  const order = { negativo: 0, positivo: 1, neutro: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 4);
}
