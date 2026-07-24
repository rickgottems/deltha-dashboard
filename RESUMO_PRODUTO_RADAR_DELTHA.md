# Radar Deltha — Resumo do Produto

## O que é

Um **dashboard financeiro/operacional em SaaS multiempresa**. Qualquer empresa se cadastra,
faz login e enxerga só os próprios dados — receitas, despesas, vendas, clientes, metas e um
conjunto de análises financeiras (DRE gerencial, Balanço/DFC, Score de Saúde Financeira, Ponto
de Equilíbrio, risco de inadimplência).

Nasceu como ferramenta interna do escritório de contabilidade Deltha (1 instância local por
cliente do escritório) e evoluiu para um produto que pode ser vendido/oferecido tanto para
clientes do escritório (dados chegam automaticamente via nota fiscal) quanto para qualquer outra
empresa fora dessa carteira (lança os dados manualmente ou via integração própria).

## Para quem é

Dono ou responsável financeiro de pequena/média empresa que hoje não tem visibilidade
consolidada do próprio negócio — substitui parte do trabalho de "olhar a planilha" por um
painel único com alertas automáticos quando algo foge do esperado (margem caindo, caixa
apertando, inadimplência subindo, alavancagem alta).

Dois perfis de conta:
- **Cliente Deltha**: empresa atendida pelo escritório de contabilidade — pode receber dados
  automaticamente via importação de nota fiscal eletrônica.
- **Externo**: qualquer empresa fora dessa carteira — lança tudo manualmente pela interface ou
  conecta um sistema próprio via chave de API.

## O que o software faz hoje

- **Cadastro e login** por empresa (CNPJ obrigatório, autopreenchimento de razão
  social/endereço via consulta pública na Receita Federal).
- **Lançamento de receitas, despesas, vendas e clientes**, com classificação contábil (DRE) em
  cada despesa.
- **Dashboard Executivo**: visão consolidada de metas, ranking de produtos/vendedores,
  indicadores gerais.
- **Dashboard Financeiro**: receita × despesa, lucro, fluxo de caixa, EBITDA, margem de
  contribuição, inadimplência — tudo com comparação contra o período anterior.
- **Ponto de Equilíbrio**: quanto a empresa precisa faturar no período pra cobrir os custos
  fixos, com indicação visual de estar acima ou abaixo desse limiar.
- **Score de Saúde Financeira** (0–100): a partir de Balanço Patrimonial e Demonstrativo de
  Fluxo de Caixa lançados manualmente, calcula liquidez, alavancagem, cobertura de juros, giro
  de ativos e runway de caixa — com alertas automáticos quando algum indicador sai do saudável.
  **Importante**: é heurística puramente matemática, com limiares configuráveis por empresa —
  não é inteligência artificial nem previsão estatística.
- **Score de risco de inadimplência** por cliente, mesma lógica determinística.
- **Metas** configuráveis por empresa (receita, lucro, margem, faturamento de vendas, novos
  clientes), com acompanhamento automático.
- **Alertas configuráveis**: cada empresa define seus próprios limiares (ex.: "avisar quando
  margem líquida cair abaixo de X%") em vez de regra fixa igual pra todo mundo.
- **Relatórios/exportação** dos dados financeiros.
- **Calendário** com integração opcional ao Google Calendar.
- **Importação automática de nota fiscal (NF-e)** para clientes do escritório — um robô externo
  baixa os XMLs e o sistema transforma isso em clientes, produtos, vendas e contas a receber sem
  digitação manual.
- **Importação de planilha de despesas** (sistema Domínio, usado pelo escritório) com wizard de
  mapeamento de colunas.
- **Chave de API própria por empresa**, para quem quiser automatizar lançamentos via script/
  robô próprio (mesmos endpoints que a interface usa).
- **Controle de acesso por papel** (Admin / Financeiro / Leitura) — usuário "Leitura" só
  consulta, não pode criar/editar/excluir nada.
- **Arquivamento do arquivo-fonte de cada importação** (XML da nota, planilha) em
  armazenamento na nuvem, para auditoria futura.

## É um MVP?

**Sim, ainda é um MVP em produção fechada — validando com um primeiro cliente real
(o próprio escritório e a carteira dele), não uma versão 1.0 pronta para escalar sozinha.**

Sinais de que já passou do estágio de protótipo:
- Multiempresa de verdade, com isolamento de dados garantido por linha de código, não por
  convenção.
- Banco de dados gerenciado (Supabase/PostgreSQL) com histórico de migrações versionado —
  mudanças de estrutura não arriscam mais perder dado por acidente.
- Autenticação real (sessão + chave de API), controle de acesso por papel.
- Deploy automatizado (Railway), com pipeline único do build ao ar.

Sinais de que ainda é MVP, não produto maduro:
- **Um usuário por empresa** — não existe convite de segundo usuário ainda (o campo de papel/
  permissão já existe no banco, mas não há tela para usar isso na prática).
- **Importação de nota fiscal depende de uma pasta única no servidor**, não escalável para
  múltiplos clientes ao mesmo tempo sem intervenção manual por enquanto.
- Nenhum teste automatizado (a verificação de qualidade hoje é checagem de tipos + teste manual
  a cada mudança, não uma suíte de testes).
- Sem plano pago, cobrança ou onboarding self-service — cadastro é livre, mas não há
  monetização implementada.
- Sem app mobile, sem notificação por e-mail/WhatsApp dos alertas (hoje só aparecem dentro do
  próprio painel).
- Uma única pessoa constrói e mantém o sistema; não há processo formal de QA além da revisão de
  cada mudança feita nesta conversa.

## Diferencial

A maioria dos concorrentes de "dashboard financeiro para PME" no Brasil ou (a) só espelha dados
de um ERP existente, ou (b) vende "IA" para prever fluxo de caixa sem transparência sobre o
cálculo. O Radar Deltha aposta no oposto: todo alerta e todo score é uma fórmula auditável e
documentada, com limiar configurável pela própria empresa — o usuário sempre consegue explicar
"por que o sistema está me avisando isso", o que importa especialmente no contexto de um
escritório de contabilidade assinando embaixo dos números.

## Stack (resumo técnico)

Node.js + Express + TypeScript no backend, PostgreSQL (Supabase) como banco, React + Vite no
frontend, hospedado no Railway como um único serviço. Detalhes completos de arquitetura em
[`CLAUDE.md`](CLAUDE.md) e no relatório técnico [`RELATORIO_TECNICO_RADAR_DELTHA.md`](RELATORIO_TECNICO_RADAR_DELTHA.md).
