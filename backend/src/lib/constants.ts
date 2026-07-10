// Valores válidos dos campos String do schema (SQLite não suporta enums nativos;
// manter em sincronia com prisma/schema.prisma e frontend/src/lib/constants.ts).

export const RECEIVABLE_STATUS = ['PENDENTE', 'PAGA', 'ATRASADA', 'CANCELADA'] as const;

// Tipo de conta da empresa cadastrada:
//  DELTHA_CLIENT — cliente do escritório Deltha; dados podem chegar via importação
//                  automática de NF-e (uma vez configurada pelo escritório)
//  EXTERNO       — empresa fora da carteira do escritório; lança tudo manualmente
export const ACCOUNT_TYPES = ['DELTHA_CLIENT', 'EXTERNO'] as const;

// Classificação DRE simplificada das despesas:
//  DEDUCAO     — impostos/deduções sobre a receita (entre Receita Bruta e Líquida)
//  CUSTO       — custo direto (CMV/CSV)
//  OPERACIONAL — despesas operacionais (SG&A)
//  DEPRECIACAO — depreciação/amortização (soma de volta no EBITDA)
//  FINANCEIRA  — juros e resultado financeiro (soma de volta no EBITDA)
//  OUTRA       — outras receitas/despesas não recorrentes
export const EXPENSE_KINDS = [
  'DEDUCAO',
  'CUSTO',
  'OPERACIONAL',
  'DEPRECIACAO',
  'FINANCEIRA',
  'OUTRA',
] as const;

export const TASK_STATUS = ['EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'] as const;

// Origem de um lançamento (Receivable/Sale/Expense):
//  MANUAL  — digitado na UI
//  NFE     — importado automaticamente de XML de NF-e (ver services/nfeImport.ts)
//  DOMINIO — importado de planilha exportada do sistema Domínio (ver services/expenseImport.ts)
export const RECORD_SOURCES = ['MANUAL', 'NFE', 'DOMINIO'] as const;

export const THRESHOLD_DIRECTIONS = ['BELOW', 'ABOVE'] as const;

// Registro das métricas que possuem regra de alerta configurável.
// A UI de Configurações edita os LIMIARES; as métricas em si são calculadas
// pelo backend (services/finance.ts) — por isso a lista é fixa no código.
export interface MetricDef {
  key: string;
  label: string;
  unit: '%' | 'R$';
  defaultDirection: 'BELOW' | 'ABOVE';
  scope: 'executivo' | 'financeiro' | 'ambos';
  description: string;
}

export const ALERT_METRICS: MetricDef[] = [
  {
    key: 'margem_liquida',
    label: 'Margem Líquida',
    unit: '%',
    defaultDirection: 'BELOW',
    scope: 'ambos',
    description: 'Lucro líquido ÷ receita líquida do mês',
  },
  {
    key: 'margem_ebitda',
    label: 'Margem EBITDA',
    unit: '%',
    defaultDirection: 'BELOW',
    scope: 'ambos',
    description: 'EBITDA ÷ receita líquida do mês',
  },
  {
    key: 'margem_contribuicao',
    label: 'Margem de Contribuição',
    unit: '%',
    defaultDirection: 'BELOW',
    scope: 'financeiro',
    description: 'Média de (preço venda − preço custo) ÷ preço venda dos produtos ativos (Configurações → Produtos)',
  },
  {
    key: 'inadimplencia',
    label: 'Inadimplência',
    unit: '%',
    defaultDirection: 'ABOVE',
    scope: 'ambos',
    description: 'Valor vencido e não pago ÷ faturamento (12 meses móveis)',
  },
  {
    key: 'fluxo_caixa',
    label: 'Fluxo de Caixa do mês',
    unit: 'R$',
    defaultDirection: 'BELOW',
    scope: 'financeiro',
    description: 'Recebimentos (caixa) − despesas do mês',
  },
  {
    key: 'comprometimento_receita',
    label: 'Despesas ÷ Receita',
    unit: '%',
    defaultDirection: 'ABOVE',
    scope: 'financeiro',
    description: 'Total de despesas ÷ receita bruta do mês',
  },
  {
    key: 'atingimento_meta_receita',
    label: 'Atingimento da meta de receita',
    unit: '%',
    defaultDirection: 'BELOW',
    scope: 'executivo',
    description: 'Receita do mês ÷ meta de receita (Configurações → Metas)',
  },
];

// Chaves de metas configuráveis (Configurações → Metas)
export const GOAL_METRICS = [
  { key: 'receita_total', label: 'Meta de Receita mensal', unit: 'R$' },
  { key: 'lucro_liquido', label: 'Meta de Lucro Líquido mensal', unit: 'R$' },
  { key: 'margem_liquida', label: 'Meta de Margem Líquida', unit: '%' },
  { key: 'faturamento_vendas', label: 'Meta de Faturamento de Vendas mensal', unit: 'R$' },
  { key: 'novos_clientes', label: 'Meta de Novos Clientes por mês', unit: 'qtd' },
] as const;

export const GOAL_DEFAULT_PERIOD = 'default';
