// ============================================================
// Motor de sinais de alerta do DRE (Fase 3) — SEPARADO do motor de
// alert_thresholds (Configurações → Alertas). Aquele compara 1 valor × 1
// limiar editável pela UI; este aplica 7 regras fixas de análise de
// demonstrações financeiras, algumas delas COMPARAÇÕES entre duas métricas
// (não cabem no modelo "valor vs limiar"). Por isso os limiares abaixo são
// constantes de código, não linhas de banco — é aqui que se ajustam.
//
// Escopo desta v1 (decisão registrada): só as 7 regras de DRE do pedido
// original. Regras de Balanço Patrimonial e DFC ficaram de fora porque o
// schema não tem Goodwill/Ativo Circulante/Passivo Circulante/Estoques/
// CAPEX/dívida — implementá-las exigiria um módulo de dados novo.
//
// "Cobertura de Juros" usa Expense kind=FINANCEIRA como PROXY de juros
// pagos (o schema não distingue juros de outras despesas financeiras) —
// resultado é uma aproximação, documentada aqui e na label do alerta.
// ============================================================

import { pctChange, periodFinance, prevPeriodFinance, type FinanceFilterOpts } from './finance.js';
import type { AlertLevel } from './alerts.js';
import { safeDivide } from '../lib/mathUtils.js';

export interface DreAlert {
  metricKey: string;
  label: string;
  level: AlertLevel; // 'critico' | 'atencao' (regras de DRE nunca geram 'confortavel' — só aparecem quando disparam)
  value: number | null;
  message: string;
}

// Limiares fixos das 7 regras (ajustar aqui, não espalhar pela UI).
const DRE_RULE_THRESHOLDS = {
  margemBrutaMin: 10, // %
  crescimentoReceitaMin: 2, // %
  margemEbitdaMin: 3, // %
  margemLiquidaMin: 1, // %
  coberturaJurosMin: 1.5, // razão
};

export async function evaluateDreAlerts(
  fromYm: string,
  toYm: string,
  opts: FinanceFilterOpts
): Promise<DreAlert[]> {
  const [atual, anterior] = await Promise.all([
    periodFinance(fromYm, toYm, opts),
    prevPeriodFinance(fromYm, toYm, opts),
  ]);

  const alerts: DreAlert[] = [];

  // 1. Margem Bruta < 10%  (Receita Líquida − Custos) ÷ Receita Líquida
  const margemBruta = safeDivide((atual.receitaLiquida - atual.custos) * 100, atual.receitaLiquida);
  if (margemBruta !== null && margemBruta < DRE_RULE_THRESHOLDS.margemBrutaMin) {
    alerts.push({
      metricKey: 'dre_margem_bruta',
      label: 'Margem Bruta',
      level: 'atencao',
      value: margemBruta,
      message: `Margem Bruta em ${margemBruta.toFixed(1)}% — abaixo do limite saudável de ${DRE_RULE_THRESHOLDS.margemBrutaMin}%.`,
    });
  }

  // 2. Taxa de Crescimento da Receita < 2% vs período anterior
  const crescimentoReceita = pctChange(atual.receitaBruta, anterior.receitaBruta);
  if (crescimentoReceita !== null && crescimentoReceita < DRE_RULE_THRESHOLDS.crescimentoReceitaMin) {
    alerts.push({
      metricKey: 'dre_crescimento_receita',
      label: 'Taxa de Crescimento da Receita',
      level: 'atencao',
      value: crescimentoReceita,
      message: `Receita cresceu ${crescimentoReceita.toFixed(1)}% vs período anterior — abaixo do mínimo saudável de ${DRE_RULE_THRESHOLDS.crescimentoReceitaMin}%.`,
    });
  }

  // 3. Lucro Líquido < Fluxo de Caixa Operacional (proxy: fluxoCaixa regime caixa)
  // Sinal de qualidade do resultado: lucro contábil maior que a geração de caixa real sugere
  // receita ainda não recebida ou despesas não desembolsadas distorcendo o resultado.
  if (atual.lucroLiquido < atual.fluxoCaixa) {
    alerts.push({
      metricKey: 'dre_lucro_vs_fco',
      label: 'Lucro Líquido vs Fluxo de Caixa Operacional',
      level: 'atencao',
      value: atual.lucroLiquido - atual.fluxoCaixa,
      message: `Lucro Líquido (${atual.lucroLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) menor que o Fluxo de Caixa Operacional (${atual.fluxoCaixa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) — resultado contábil pode não refletir a geração de caixa real.`,
    });
  }

  // 4. Margem EBITDA < 3%
  if (atual.margemEbitda !== null && atual.margemEbitda < DRE_RULE_THRESHOLDS.margemEbitdaMin) {
    alerts.push({
      metricKey: 'dre_margem_ebitda',
      label: 'Margem EBITDA',
      level: 'critico',
      value: atual.margemEbitda,
      message: `Margem EBITDA em ${atual.margemEbitda.toFixed(1)}% — abaixo do limite crítico de ${DRE_RULE_THRESHOLDS.margemEbitdaMin}%.`,
    });
  }

  // 5. Margem Líquida < 1%
  if (atual.margemLiquida !== null && atual.margemLiquida < DRE_RULE_THRESHOLDS.margemLiquidaMin) {
    alerts.push({
      metricKey: 'dre_margem_liquida',
      label: 'Margem Líquida',
      level: 'critico',
      value: atual.margemLiquida,
      message: `Margem Líquida em ${atual.margemLiquida.toFixed(1)}% — abaixo do limite crítico de ${DRE_RULE_THRESHOLDS.margemLiquidaMin}%.`,
    });
  }

  // 6. Custos Diretos crescendo mais rápido que as Vendas (receita bruta como proxy de "vendas")
  const crescimentoCustos = pctChange(atual.custos, anterior.custos);
  if (crescimentoCustos !== null && crescimentoReceita !== null && crescimentoCustos > crescimentoReceita) {
    alerts.push({
      metricKey: 'dre_custos_vs_vendas',
      label: 'Custos Diretos vs Vendas',
      level: 'atencao',
      value: crescimentoCustos - crescimentoReceita,
      message: `Custos cresceram ${crescimentoCustos.toFixed(1)}% contra ${crescimentoReceita.toFixed(1)}% da Receita — custos estão crescendo mais rápido que as vendas.`,
    });
  }

  // 7. Índice de Cobertura de Juros < 1,5  (EBIT ÷ despesas FINANCEIRA)
  // PROXY: "juros" = Expense kind=FINANCEIRA (schema não separa juros de outras despesas
  // financeiras). Sem despesa financeira no período, a regra não se aplica (cobertura ilimitada).
  // Usa EBIT (lucro ANTES do resultado financeiro), não Lucro Operacional (que já desconta
  // financeiras) — dividir um valor pós-juros por juros de novo subestimaria a cobertura real.
  if (atual.financeiras > 0) {
    const coberturaJuros = safeDivide(atual.ebit, atual.financeiras)!;
    if (coberturaJuros < DRE_RULE_THRESHOLDS.coberturaJurosMin) {
      alerts.push({
        metricKey: 'dre_cobertura_juros',
        label: 'Índice de Cobertura de Juros (proxy)',
        level: 'critico',
        value: coberturaJuros,
        message: `Cobertura de juros em ${coberturaJuros.toFixed(2)}x — abaixo do mínimo de ${DRE_RULE_THRESHOLDS.coberturaJurosMin}x (Lucro Operacional ÷ despesas financeiras, usado como proxy de juros).`,
      });
    }
  }

  const order: Record<AlertLevel, number> = { critico: 0, atencao: 1, confortavel: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}
