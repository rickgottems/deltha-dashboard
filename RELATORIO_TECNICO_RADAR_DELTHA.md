# Relatório Técnico — Radar Deltha (Dashboard Empresarial SaaS)

**Gerado em:** 2026-07-16
**Repositório:** https://github.com/rickgottems/deltha-dashboard
**Produção:** https://deltha-dashboard-production.up.railway.app

Este documento resume o estado completo do desenvolvimento do software até o momento, para uso
por qualquer pessoa (ou IA) que vá analisar, auditar ou continuar o projeto.

---

## 1. O que é o produto

Dashboard financeiro/operacional corporativo, originalmente construído para o escritório
"Deltha Soluções Tributárias e Empresariais" atender seus clientes. Evoluiu de uma ferramenta
interna (1 instância isolada por empresa-cliente do escritório) para um **SaaS multiempresa**:
um único sistema publicado onde qualquer empresa se cadastra, faz login e só enxerga os
próprios dados.

Uma empresa cadastrada pode ser de dois tipos (`accountType`):
- **DELTHA_CLIENT** — cliente do escritório; a ideia é que os dados cheguem via importação
  automática de NF-e (mecanismo já existe, mas hoje só funciona por pasta local — ver seção 8).
- **EXTERNO** — empresa fora da carteira do escritório; lança tudo manualmente (ou via API
  própria).

O sistema cobre: DRE gerencial, fluxo de caixa, vendas, contas a receber/pagar, clientes com
score de risco de inadimplência, operações (tarefas/prazos de equipes), Balanço Patrimonial e
DFC (lançamento manual), e um motor de regras de alerta/diagnóstico financeiro determinístico
(não é IA/machine learning — decisão de negócio explícita, ver seção 6).

---

## 2. Stack de tecnologia

### Backend
- **Runtime**: Node.js v24
- **Linguagem**: TypeScript, modo `strict: true`, executado via `tsx` (sem build step em dev)
- **Framework web**: Express 4
- **ORM**: Prisma 6
- **Banco de dados**: **PostgreSQL** (migrado de SQLite em julho/2026 — ver seção 5)
- **Autenticação**: JWT (`jsonwebtoken`) em cookie httpOnly para sessão de usuário humano; chave
  de API (hash SHA-256) para integração máquina-a-máquina; senha com `bcryptjs`
- **Outras libs**: `cors`, `cookie-parser`, `multer` (upload), `exceljs` (Excel),
  `pdfkit` (PDF), `fast-xml-parser` (XML de NF-e)

### Frontend
- **Framework**: React 18 + Vite
- **Estilo**: Tailwind CSS v4
- **Gráficos**: Recharts
- **Animações**: Framer Motion
- **Roteamento**: React Router v6
- Sem gerenciador de estado global (Context API só para autenticação); cada página busca seus
  próprios dados via um hook `useFetch` simples sobre `fetch` nativo

### Infraestrutura / Deploy
- **Hospedagem**: Railway (projeto "robust-quietude")
- **Banco de dados gerenciado**: Postgres do próprio Railway (plugin nativo)
- **Deploy**: `Dockerfile` na raiz do repo — build multi-stage: builda o frontend (Vite) e copia
  o `dist` para dentro da imagem do backend. Express serve os arquivos estáticos do frontend —
  **é 1 serviço só**, não dois deploys separados.
- **Comando de start do container**: `npx prisma db push && npm start` — **sem**
  `--accept-data-loss` de propósito: se uma mudança de schema fosse destrutiva, o deploy falha
  em vez de apagar dado silenciosamente (decisão de segurança).
- **Variáveis de ambiente obrigatórias no Railway**: `DATABASE_URL` (referência ao Postgres do
  Railway), `JWT_SECRET`
- Não há migration history do Prisma versionada ainda (`prisma migrate`) — o schema é
  sincronizado via `db push` a cada deploy. Isso foi uma decisão consciente enquanto o banco
  estava vazio/sem dado real de cliente; deveria migrar para `prisma migrate` versionado antes
  de operar com dados reais em produção de forma mais madura.

---

## 3. Estrutura de pastas (resumo)

```
deltha-dashboard/
├── Dockerfile
├── CLAUDE.md                 ← contexto do projeto para IAs (Claude Code)
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma     ← schema completo do banco (ver seção 4)
│   │   ├── seed-demo.ts      ← popula uma "Empresa Demo" fictícia p/ testes visuais
│   │   └── clean-data.ts     ← limpa só a Empresa Demo
│   ├── src/
│   │   ├── index.ts          ← entrypoint Express, monta todas as rotas
│   │   ├── db.ts             ← client Prisma singleton
│   │   ├── lib/
│   │   │   ├── auth-middleware.ts   ← requireAuth (cookie OU chave de API)
│   │   │   ├── constants.ts         ← enums de domínio, métricas de alerta configuráveis
│   │   │   ├── http.ts              ← helpers de validação/erro HTTP
│   │   │   ├── period.ts            ← helpers de data/período (YYYY-MM)
│   │   │   └── mathUtils.ts         ← round2/safeDivide (aritmética financeira segura)
│   │   ├── services/
│   │   │   ├── auth.ts              ← hash de senha, JWT
│   │   │   ├── apiKey.ts            ← geração/verificação de chave de API
│   │   │   ├── finance.ts           ← núcleo do DRE gerencial (ver seção 6)
│   │   │   ├── alerts.ts            ← motor de alertas configuráveis (alert_thresholds)
│   │   │   ├── dreAlerts.ts         ← 7 regras fixas de análise de DRE
│   │   │   ├── healthScore.ts       ← Score de Saúde Financeira (Balanço+DFC)
│   │   │   ├── risk.ts              ← score de risco de inadimplência por cliente
│   │   │   ├── insights.ts          ← insights executivos em texto (determinístico)
│   │   │   ├── calendar.ts          ← integração Google Calendar (OAuth, opcional)
│   │   │   ├── cnpjLookup.ts        ← consulta pública de CNPJ (BrasilAPI)
│   │   │   ├── nfeParser.ts / nfeImport.ts     ← importação de XML de NF-e
│   │   │   ├── expenseImport.ts     ← importação de planilha de despesas (Domínio)
│   │   │   └── exporter.ts          ← geração de relatórios PDF/Excel
│   │   └── routes/                  ← 1 arquivo por área (auth, executivo, financeiro,
│   │                                   receitas, despesas, vendas, clientes, operacoes,
│   │                                   balanco, config, calendar, relatorios, importacoes)
├── frontend/
│   ├── src/
│   │   ├── main.tsx           ← rotas React Router (login/signup públicas, resto atrás de RequireAuth)
│   │   ├── context/AuthContext.tsx
│   │   ├── components/        ← Layout, Sidebar, RequireAuth, AlertsPanel, InsightsPanel,
│   │   │                        KpiCard, charts.tsx, pickers.tsx, ui.tsx (design system)
│   │   ├── pages/              ← Login, Signup, Executivo, Financeiro, Receitas, Despesas,
│   │   │                         Vendas, Clientes, Operacoes, Calendario, Relatorios,
│   │   │                         Configuracoes (com sub-abas internas)
│   │   ├── lib/                ← api.ts (fetch wrapper), format.ts, palette.ts (cores)
│   │   └── index.css           ← tokens de design (Tailwind @theme)
```

---

## 4. Schema do banco de dados (Prisma / PostgreSQL) — 16 models

Todos os modelos de negócio carregam `companyId` (isolamento multiempresa obrigatório) e têm
`onDelete: Cascade` a partir de `Company`.

| Model | Papel |
|---|---|
| `Company` | Tenant. Nome, CNPJ (único, nullable no schema mas obrigatório na API), `accountType` (DELTHA_CLIENT\|EXTERNO) |
| `User` | Login (email único, hash de senha). 1 usuário por empresa hoje (multiusuário por empresa é evolução futura) |
| `ApiKey` | Chaves de integração máquina-a-máquina (hash SHA-256, nunca texto puro) |
| `Client` | Clientes da empresa cadastrada (CNPJ único por empresa) |
| `Receivable` | Contas a receber — também histórico de cobrança usado no score de risco |
| `Expense` | Despesas, classificadas por `kind` (DEDUCAO\|CUSTO\|OPERACIONAL\|DEPRECIACAO\|FINANCEIRA\|OUTRA) — alimenta o DRE |
| `Product`, `Seller`, `Sale` | Catálogo e vendas |
| `Team`, `Task` | Operações (tarefas, prazos, motivo de atraso) |
| `BalanceSheet` | Balanço Patrimonial, snapshot manual por mês (Ativo Circulante, Estoques, Dívida, PL, etc.) |
| `CashFlowStatement` | DFC manual por mês (Fluxo de Caixa Operacional, CAPEX) |
| `AlertThreshold` | Limiares de alerta configuráveis por empresa (`metricKey`, yellow/red, direction) |
| `Goal` | Metas por métrica/período |
| `IntegrationToken` | OAuth do Google Calendar, 1 por empresa |
| `ImportedDocument` | Dedup de importações (NF-e/planilha), idempotência |

**Padrões consistentes em todo o schema**: `id` sempre `cuid()`; toda tabela de negócio indexada
por `companyId`; chaves únicas que fariam sentido global viram compostas com `companyId` (ex.:
`@@unique([companyId, cnpj])` em `Client`) para isolamento real entre empresas.

*(O arquivo `schema.prisma` completo, ~350 linhas, pode ser anexado à parte se a IA analisando
precisar do detalhe campo-a-campo — está em `backend/prisma/schema.prisma` no repositório.)*

---

## 5. Histórico de decisões de arquitetura relevantes

1. **SQLite → PostgreSQL** (jul/2026): o projeto começou em SQLite (single-tenant, 1 instância
   por cliente, "não precisava de Postgres instalado"). Ao virar SaaS multiempresa de verdade,
   múltiplas empresas escrevendo ao mesmo tempo tornou o SQLite arriscado (trava de escrita
   concorrente, observado em teste real). Migrado para Postgres do Railway. A migração foi feita
   com o banco vazio (sem dado de cliente real), então não há perda de dado envolvida.
2. **Single-tenant → Multiempresa** (jul/2026): pivô arquitetural grande. Antes: 1 backend + 1
   banco por cliente do escritório, sem login. Depois: 1 deploy só, com autenticação, todo dado
   isolado por `companyId`. Foi um retrofit de ~35 endpoints existentes para adicionar o escopo
   de tenant em toda leitura/escrita.
3. **Autenticação dupla**: sessão de cookie (humano, navegador) OU chave de API (máquina). Ambas
   passam pelo mesmo middleware `requireAuth`, que popula `req.companyId` de um jeito ou de
   outro — todas as rotas existentes automaticamente suportam os dois métodos sem duplicação.
4. **Motor de regras financeiras**: ao longo do desenvolvimento, references de "motor de regras"
   foram fornecidas por IAs diferentes (Gemini) 3-4 vezes, cada uma reimplementando o mesmo
   conceito. A decisão tomada foi **nunca duplicar** — sempre comparar contra o motor já existente
   (`finance.ts` + `dreAlerts.ts` + `healthScore.ts`) e só portar o que é genuinamente novo,
   fundido no que já existe. Isso evitou ter dois sistemas de threshold/duas rotas de análise
   competindo entre si.
5. **Threshold de alerta 100% configurável por banco**: nenhuma regra de alerta tem número
   hardcoded na UI — tudo vem da tabela `alert_thresholds`, editável por empresa em
   Configurações → Alertas. As 7 regras fixas de DRE (`dreAlerts.ts`) são exceção documentada
   (limiares em código, não no banco).
6. **Nunca chamar de "IA"**: o escritório (cliente real por trás do projeto) proibiu
   explicitamente enquadrar qualquer score/regra como "IA preditiva". Todo o motor de
   diagnóstico é heurística determinística (if/threshold), documentada como tal no código e na
   UI — nunca machine learning, nunca chamada a LLM para decisão financeira.

---

## 6. Motor financeiro — como as regras de negócio funcionam

### DRE gerencial (`services/finance.ts`)
```
Receita Bruta       = Σ receivables com vencimento no período (regime de competência)
Deduções            = Σ despesas kind=DEDUCAO
Receita Líquida     = Receita Bruta − Deduções
Custos              = Σ despesas kind=CUSTO
Despesas Operac.    = Σ despesas kind ∈ {OPERACIONAL, DEPRECIACAO}
Outras Rec/Desp     = Σ despesas kind ∈ {OUTRA, FINANCEIRA}
Lucro Operacional   = Receita Líquida − Custos − Despesas Operac. − Outras
Lucro Líquido (v1)  = Lucro Operacional (IR/CSLL fora do escopo)
EBITDA              = Lucro Operacional + Depreciação + Financeiras (add-back)
EBIT                = Lucro Operacional + Financeiras (mantém depreciação deduzida)
Fluxo de Caixa      = Σ receivables PAGAS no mês − Σ despesas (regime de caixa)
```
Toda divisão passa por `safeDivide()` (retorna `null`, não 0 ou `Infinity`, em denominador
zero — "sem dado" é semanticamente diferente de "razão zero" nesse domínio).

### Camada de alertas configuráveis (`services/alerts.ts`)
Compara 1 métrica × 1 limiar (yellow/red) vindo do banco, por empresa. Métricas hoje cobertas:
margem líquida, margem EBITDA, inadimplência, fluxo de caixa, comprometimento de receita,
atingimento de meta, margem de contribuição, liquidez seca/corrente, alavancagem, cobertura de
juros, CAPEX/lucro, runway de caixa.

### 7 regras fixas de DRE (`services/dreAlerts.ts`)
Margem Bruta, Crescimento de Receita, Lucro vs Fluxo de Caixa, Margem EBITDA, Margem Líquida,
Custos vs Vendas, Cobertura de Juros — limiares fixos em código (decisão registrada).

### Score de Saúde Financeira (`services/healthScore.ts`)
Motor de duas camadas sobre Balanço Patrimonial + DFC (lançamento manual, ver seção 7):
- **Atômicas**: liquidez seca/corrente, alavancagem dívida/EBITDA, cobertura de juros, CAPEX
  sobre lucro, runway de caixa, FCO≤0 isolado, contas a receber crescendo mais que vendas.
- **Compostas** (cruzam atômicas + dreAlerts para reduzir falso positivo): "Crescimento
  Inflado" (giro de ativos caindo com receita subindo), "Concentração de Risco Comercial"
  (clientes ativos caindo com receita subindo), "Funil Administrativo Comprometido" (EBITDA
  crítico sem margem bruta baixa — aponta problema de Opex, não de produto), "Destruição de
  Valor" (Fluxo de Caixa Livre caindo 3 meses seguidos).
- Health Score final: 0 a 100, penaliza por alerta crítico/atenção, bonifica margem EBITDA e
  liquidez saudáveis.

### Score de risco de inadimplência (`services/risk.ts`)
Por cliente, sobre os últimos 12 meses de cobrança: `% de faturas atrasadas` e `média de dias de
atraso` classificam em BAIXO/MÉDIO/ALTO/SEM_HISTÓRICO. Heurística documentada, não é ML.

---

## 7. Balanço Patrimonial e DFC

**Lançamento 100% manual**, por empresa + mês (`Configurações → Balanço & DFC`) — nada disso é
derivável das outras tabelas (não existe conceito de "estoque", "dívida" ou "patrimônio líquido"
em nenhum outro lugar do schema). Ao salvar, o backend valida:
- Equação contábil fundamental: `Ativo Total = Passivo + Patrimônio Líquido` (tolerância de 1
  centavo)
- Estoques não pode exceder o Ativo Circulante
- Nenhum campo estruturalmente não-negativo pode vir negativo (fail-fast contra erro de digitação)

---

## 8. Integrações e importação de dados

1. **NF-e**: XML processado por `services/nfeParser.ts` + `nfeImport.ts`. **Limitação atual
   conhecida**: a pasta de origem (`NFE_IMPORT_DIR`) é única/global no `.env`, não por empresa —
   não escala para o modelo multiempresa (funciona só rodando o robô manualmente por vez,
   passando a empresa por e-mail: `npm run import:nfe -- <pasta> <email-da-empresa>`). Migrar
   para pasta configurável por empresa é trabalho pendente.
2. **Planilha de despesas (sistema Domínio)**: sem API própria, exportação manual → wizard de
   mapeamento de colunas na UI (`expenseImport.ts`).
3. **Chave de API**: qualquer script externo autenticado com `Authorization: Bearer dk_live_...`
   pode usar os mesmos endpoints REST que o frontend usa (`POST /api/receitas`, `/despesas`,
   `/vendas` etc.) — é o caminho recomendado hoje para integração automatizada (mais simples que
   o `NFE_IMPORT_DIR`).
4. **Google Calendar**: OAuth2 opcional, 1 token por empresa, aba Calendário funciona em modo
   "não conectado" sem credenciais configuradas.
5. **Consulta de CNPJ**: `GET /api/auth/cnpj-lookup/:cnpj` usa a BrasilAPI (gratuita, pública) só
   para autopreencher razão social/endereço no cadastro — não tem acesso a nada fiscal/financeiro
   (isso exigiria certificado digital da empresa, fora do escopo).

Deduplicação de importações: tabela `ImportedDocument` (chave de acesso da NF-e ou hash de linha
da planilha), agora escopada por `companyId` também.

---

## 9. Design system / frontend

- Paleta: navy profundo (`#070b1c`/`#0d1430`) + vermelho carmim (`#d81f45`) como cor de marca;
  cores semânticas de status independentes (verde/amarelo/vermelho — laranja planejado, ainda
  não implementado)
- Tokens de cor duplicados propositalmente em dois lugares que precisam ficar sincronizados:
  `frontend/src/index.css` (Tailwind `@theme`) e `frontend/src/lib/palette.ts` (espelho em JS,
  porque a lib de gráficos Recharts não lê variáveis CSS)
- Regra de processo: **nunca mudar cor/token de design como efeito colateral de programar uma
  feature nova** — só quando estritamente necessário para a própria feature

---

## 10. O que está PENDENTE / não implementado ainda

- `accountType` (DELTHA_CLIENT × EXTERNO) existe no schema/cadastro mas ainda não muda
  comportamento/UI além do próprio formulário de cadastro — falta a página "Lançamentos"
  consolidada para contas EXTERNO e a automação de NF-e de fato só para DELTHA_CLIENT
- `NFE_IMPORT_DIR` por empresa (hoje é 1 pasta global — ver seção 8)
- Multiusuário por empresa (hoje é 1 usuário = 1 empresa)
- Migration history do Prisma versionada (hoje usa `db push` direto)
- Mais visualizações/gráficos por aba, dashboard executivo mais completo, insights executivos em
  texto corrido cruzando os alertas de Balanço/DFC (backlog original do produto, fases 4-7 nunca
  totalmente fechadas)
- Painel de "radar" visual de 4 cores (verde/amarelo/laranja/vermelho) baseado em Ponto de
  Equilíbrio — desenhado conceitualmente numa conversa anterior, não implementado
- **Problema em aberto agora**: banco Supabase adicionado no Railway causou crash — sendo
  investigado nesta mesma sessão (ver commits recentes / issue tracker do Railway)

---

## 11. Como rodar localmente

```bash
# Backend
cd backend
npm install
# preencher .env com DATABASE_URL (Postgres) e JWT_SECRET
npm run dev          # porta 3001

# Frontend
cd frontend
npm install
npm run dev           # porta 5173, proxy /api -> localhost:3001
```

Scripts úteis do backend: `npm run db:demo` (popula uma "Empresa Demo" fictícia,
login `demo@deltha.local` / senha `demo12345`, para teste visual), `npm run db:clean` (limpa só
essa empresa demo, nunca outras).
