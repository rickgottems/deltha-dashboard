# Radar Deltha — Dashboard Empresarial (SaaS multiempresa)

Dashboard financeiro/operacional. Era originalmente "1 instância por cliente do escritório
Deltha"; em 2026-07 virou **SaaS multiempresa de verdade**: um único deploy no Railway, com
login, onde qualquer empresa se cadastra e só vê os próprios dados. `accountType` na `Company`
distingue **DELTHA_CLIENT** (cliente do escritório, dados podem chegar via NF-e automática) de
**EXTERNO** (lança tudo manualmente ou via API própria).

## Stack e como rodar

- Backend: Node 24 + Express 4 + TypeScript (`tsx`) + Prisma 6 + **PostgreSQL** (migrado de
  SQLite em 2026-07 — ver "Decisões" abaixo). `cd backend && npm run dev` (porta 3001).
- Frontend: React 18 + Vite + Tailwind v4 + Recharts + Framer Motion. `cd frontend && npm run dev`
  (porta 5173, proxy de `/api` para o backend).
- **Deploy**: Railway, via `Dockerfile` na raiz (build multi-stage: builda o frontend, copia o
  `dist` pra dentro da imagem do backend — Express serve os estáticos, é 1 serviço só, não dois).
  `CMD` roda `prisma db push` (sem `--accept-data-loss` de propósito — se uma mudança de schema
  fosse destrutiva, o deploy falha em vez de apagar dado silenciosamente) e depois `npm start`.
  Variáveis obrigatórias no Railway: `DATABASE_URL` (referência ao serviço Postgres) e
  `JWT_SECRET`.
- Local dev sem Postgres instalado: não tem fallback SQLite mais — usar a `DATABASE_URL` do
  Postgres do Railway (ou um Postgres local) no `.env`.
- Scripts do backend: `db:demo`/`db:clean` agora operam só numa **"Empresa Demo"** dedicada
  (login `demo@deltha.local`), nunca em outras empresas do banco multiempresa. `db:seed` é
  no-op (os limiares de alerta padrão de cada empresa nova são criados no cadastro, ver
  `routes/auth.ts`).

## Autenticação e isolamento multiempresa

- **Toda tabela de negócio tem `companyId`** e é sempre filtrada por ele. `update`/`delete` por
  id sozinho é proibido nas rotas — sempre `updateMany`/`deleteMany` com `{ id, companyId }`
  juntos, senão uma empresa poderia editar registro de outra adivinhando o id.
- Duas formas de autenticar (`lib/auth-middleware.ts`, mesmo `requireAuth` aceita as duas):
  1. **Cookie de sessão httpOnly** (JWT) — fluxo humano no navegador (`routes/auth.ts`:
     `POST /register`, `/login` aceita e-mail OU CNPJ como `identifier`, `/logout`, `/me`).
  2. **Chave de API** (`Authorization: Bearer dk_live_...`, hash SHA-256 na tabela `ApiKey`,
     nunca a chave em texto puro) — fluxo máquina-a-máquina (ex.: robô do escritório).
     Gerenciar em Configurações → API. Usa os MESMOS endpoints que o frontend usa.
- CNPJ é obrigatório e único no cadastro; autopreenchimento de razão social/endereço via
  `GET /api/auth/cnpj-lookup/:cnpj` (BrasilAPI, dado público da Receita — **não** dá acesso a
  nada fiscal/financeiro, só cadastral).

## Onde estão as regras de negócio (motor financeiro)

Ver também a memória de projeto `deltha-motor-regras-financeiras` para os princípios de
arquitetura desse motor (vocabulário atômicas/compostas, etc.) — qualquer regra financeira nova
deve seguir esses princípios.

- **DRE gerencial** (Receita Líquida, EBITDA, EBIT, Lucro Operacional, Fluxo de Caixa):
  `backend/src/services/finance.ts`, documentado linha a linha no topo.
- **`lib/mathUtils.ts`**: `round2`/`safeDivide` — usar em TODA divisão/margem nova.
  `safeDivide` devolve `null` (não 0) em denominador zero: "sem dado" ≠ "razão zero" nesse
  domínio, e a UI inteira já trata `null` como "—".
- **Regras de alerta configuráveis por empresa** (`alert_thresholds`, editável em
  Configurações → Alertas): `services/alerts.ts` (`classify`/`fmt` reaproveitados por outros
  motores, não duplicar). ZERO limiar numérico hardcoded em regra nova — sempre um `metricKey`
  novo em `ALERT_METRICS` (`lib/constants.ts`) + default em `DEFAULT_THRESHOLDS`
  (`routes/auth.ts`, seedado no cadastro de cada empresa).
- **7 regras fixas de DRE** (margem bruta, crescimento receita, lucro vs FCO, margem EBITDA,
  margem líquida, custos vs vendas, cobertura de juros): `services/dreAlerts.ts`. Limiares em
  código (não em `alert_thresholds`) — decisão registrada, ver comentário no topo do arquivo.
- **Score de Saúde Financeira** (Balanço Patrimonial + DFC): `services/healthScore.ts`.
  Duas camadas: **atômicas** (liquidez seca/corrente, alavancagem, cobertura de juros, CAPEX/
  lucro, runway, FCO≤0, contas a receber vs vendas — thresholds vêm de `alert_thresholds`) e
  **compostas** (cruzam atômicas + alertas de `dreAlerts.ts` pra reduzir falso positivo:
  crescimento inflado, concentração de risco comercial, funil administrativo comprometido, FCL
  em queda 3 meses). Health Score 0-100. **Nunca chamar isso de "IA"** no código/UI — é
  heurística determinística, mesma política do `risk.ts` (ver abaixo).
- **Score de risco de inadimplência**: `services/risk.ts` — heurística v1 determinística e
  documentada, propositalmente NÃO é machine learning. Não evoluir para "IA preditiva" sem
  decisão explícita do negócio (regra reforçada várias vezes pelo usuário nesta sessão).
- **Metas**: tabela `goals`, editável em Configurações → Metas.
- **Classificação DRE de despesas** (`DEDUCAO|CUSTO|OPERACIONAL|DEPRECIACAO|FINANCEIRA|OUTRA`) e
  demais enums: `backend/src/lib/constants.ts`.

## Balanço Patrimonial e DFC

**Lançamento manual** por empresa+mês (Configurações → Balanço & DFC) — nada disso é derivável
de Receivable/Expense/Sale (schema não tem estoque/dívida/PL). Valida a equação contábil
(Ativo = Passivo + PL) e rejeita valores negativos em campos que nunca podem ser negativos
(`services/healthScore.ts` → `validateBalanceSheet`). Alimenta o Score de Saúde Financeira na
aba Financeiro.

## Importação automática de dados

1. **NF-e**: XML baixado por um robô Python separado (fora deste repo) →
   `services/nfeParser.ts` + `nfeImport.ts`. Configurado por `NFE_IMPORT_DIR` no `.env` — ainda
   é uma pasta ÚNICA (não por empresa), então hoje só funciona rodando o robô na mesma máquina
   do backend ou apontando pra pasta certa manualmente por vez
   (`npm run import:nfe -- <pasta> <email-da-empresa>`). Migrar pra pasta configurável por
   empresa é trabalho pendente (Fase B do roadmap, ver plano salvo em
   `C:\Users\Cliente\.claude\plans` se ainda existir).
2. **Despesas do Domínio** (planilha exportada manualmente): `services/expenseImport.ts`,
   wizard de mapeamento de colunas na UI.
3. **Chave de API** (`ApiKey`): qualquer script externo pode fazer `POST /api/receitas`,
   `/api/despesas`, `/api/vendas` etc. autenticando com `Authorization: Bearer dk_live_...` em
   vez de cookie — é o caminho recomendado hoje pro robô do escritório, mais simples que o
   `NFE_IMPORT_DIR`.

Dedup das duas primeiras: tabela `imported_documents` (chave de acesso NF-e ou hash de linha da
planilha), agora com `companyId` também. Campo `source` (`MANUAL|NFE|DOMINIO`) em
`Receivable`/`Sale`/`Expense` alimenta o badge de origem na UI.

## Design system / identidade visual

- Tokens de cor centralizados em **dois lugares que precisam ficar em sincronia byte-a-byte**:
  `frontend/src/index.css` (`@theme`, Tailwind) e `frontend/src/lib/palette.ts` (espelho em JS,
  Recharts não lê `var(--color-*)`).
- Paleta da marca Radar Deltha: navy profundo + vermelho carmim (`--color-accent`/`C.accent`)
  como destaque. Cores semânticas de alerta (verde/amarelo/vermelho) são independentes da marca
  — não confundir `C.accent` com `C.neg`.
- **Regra explícita do usuário**: não mudar cores/tokens de design como efeito colateral de
  programar uma feature nova. Mudanças de interface só quando estritamente necessárias pra
  feature em si (ex.: sidebar precisou ganhar nome da empresa + botão Sair quando o login foi
  implementado) — nunca redesenho não pedido.
- Nenhum dado mockado no código — tudo vem do banco via API, mesmo vazio.

## Coisas já decididas (não re-litigar sem motivo novo)

- **PostgreSQL, não SQLite**: migrado em 2026-07 porque múltiplas empresas escrevendo ao mesmo
  tempo (SaaS real) tornou o SQLite arriscado (trava de escrita concorrente, já observado em
  teste). Decisão anterior de "SQLite por portabilidade" está **superada**.
  A migração para Postgres foi feita com o banco vazio (sem dado de cliente real), então não
  existe migration history antiga — histórico de migrations começa do zero quando alguém rodar
  `prisma migrate dev` pela primeira vez.
- **Multiusuário/login existe** (superou a decisão antiga de "sem login nesta versão") — 1
  usuário por empresa no cadastro atual; múltiplos usuários por empresa com papéis é evolução
  futura ainda não implementada.
- **Motor financeiro**: NÃO criar um motor paralelo/duplicado quando surgir uma nova referência
  de "regras financeiras" (já aconteceu 3-4 vezes nesta sessão, sempre gerado por outra IA) —
  comparar contra `dreAlerts.ts`/`healthScore.ts`/`finance.ts` existentes e só portar o que é
  genuinamente novo. Ver memória `deltha-motor-regras-financeiras`.
- Vendas importadas de NF-e nunca têm vendedor associado (dado não confiável no XML).
- Produtos criados automaticamente por importação de NF-e nascem com `costPrice=0` — completar
  manualmente em Configurações → Produtos.

## Roadmap pendente (não implementado ainda)

- `accountType` (DELTHA_CLIENT × EXTERNO) existe no schema e no cadastro, mas ainda não muda
  nada de comportamento/UI além do próprio cadastro — página "Lançamentos" consolidada pra
  contas EXTERNO, e NF-e automática de verdade só pra DELTHA_CLIENT, são trabalho futuro.
- `NFE_IMPORT_DIR` por empresa (hoje é 1 pasta global no `.env`, não escala pra multiempresa de
  verdade — ver seção "Importação automática" acima).
- Visualizações/insights adicionais do backlog original (Fases 4-7 do pedido inicial) ainda não
  cobertas: mais gráficos por aba, dashboard executivo mais completo, insights executivos
  cruzando os alertas de Balanço/DFC em texto corrido.
