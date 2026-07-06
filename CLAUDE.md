# Radar Deltha — Dashboard Empresarial

Dashboard corporativo para o escritório Deltha Soluções Tributárias e Empresariais. Cada
empresa-cliente do escritório roda sua **própria instância** (backend + frontend + SQLite
independentes) — não é multi-tenant, não existe `Company`/`companyId` em lugar nenhum do schema.

## Stack e como rodar

- Backend: Node + Express 4 + TypeScript (`tsx`) + Prisma 6 + SQLite. `cd backend && npm run dev` (porta 3001).
- Frontend: React 18 + Vite + Tailwind v4 + Recharts + Framer Motion. `cd frontend && npm run dev` (porta 5173, faz proxy de `/api` para o backend).
- Scripts úteis do backend: `db:seed` (regras de alerta padrão), `db:demo` (12 meses de dados fictícios para visual), `db:clean` (remove dados de negócio preservando config), `db:reset` (recria o banco do zero — pede confirmação explícita do usuário quando rodado por IA).
- **Convenção do projeto**: o banco é entregue vazio. Não deixe dados de teste/demo no estado final de uma sessão — rode `npm run db:clean` antes de encerrar se você populou dados para verificação visual.

## Onde estão as regras de negócio

- **DRE gerencial e fórmulas** (Receita Líquida, EBITDA, Lucro Operacional, Fluxo de Caixa): `backend/src/services/finance.ts` — documentado linha a linha no topo do arquivo.
- **Score de risco de inadimplência**: `backend/src/services/risk.ts` — é uma **heurística v1 determinística e documentada**, propositalmente NÃO é machine learning. Não evoluir para "IA preditiva" sem decisão explícita do negócio.
- **Alertas (crítico/atenção/confortável)** e **metas**: nunca hardcoded em componente — sempre configuráveis via `alert_thresholds` e `goals` (tabelas), editáveis em Configurações → Alertas/Metas.
- **Classificação DRE de despesas** (`DEDUCAO|CUSTO|OPERACIONAL|DEPRECIACAO|FINANCEIRA|OUTRA`) e demais enums: `backend/src/lib/constants.ts` (SQLite não tem enum nativo, são strings documentadas).

## Importação automática de dados

Duas fontes alimentam o dashboard sem digitação manual (ver seção própria no `README.md`):
1. **NF-e** (XML baixado por um robô Python separado, fora deste repo) → `backend/src/services/nfeParser.ts` + `nfeImport.ts`. Configurado por `NFE_IMPORT_DIR` no `.env`.
2. **Despesas do Domínio** (planilha exportada manualmente, sem API) → `backend/src/services/expenseImport.ts`, wizard de mapeamento de colunas na UI.

Deduplicação de ambas: tabela `imported_documents` (chave de acesso da NF-e ou hash de linha da planilha). Campo `source` (`MANUAL|NFE|DOMINIO`) em `Receivable`/`Sale`/`Expense` alimenta o badge de origem na UI.

## Design system / identidade visual

- Tokens de cor centralizados em **dois lugares que precisam ficar em sincronia byte-a-byte**: `frontend/src/index.css` (`@theme`, usado pelo Tailwind) e `frontend/src/lib/palette.ts` (espelho em JS, usado pelo Recharts — Recharts não lê `var(--color-*)`). Ao mudar uma cor, mude nos dois arquivos.
- Paleta é a da marca Radar Deltha (extraída de `../Logos/Logo Deltha 1.pdf`): navy profundo como base + vermelho carmim (`--color-accent` / `C.accent`) como destaque. **Cores semânticas de alerta** (verde=positivo, amarelo=atenção, vermelho=crítico) são independentes da marca — não confundir `C.accent` (destaque/marca) com `C.neg` (crítico/semântico), mesmo sendo ambos avermelhados. Onde os dois apareceriam lado a lado (ex.: waterfall chart), usar uma cor neutra (`C.silver`/`C.blue`) para o que não é status, evitando ambiguidade.
- Logo/emblema em `frontend/public/deltha-mark.png` (PNG com fundo transparente, extraído do PDF via PyMuPDF). Usado na sidebar (`components/Sidebar.tsx`) ao lado do texto "Radar Deltha" e como favicon (`frontend/index.html`).
- Nenhum dado mockado no código — tudo vem do banco via API, mesmo vazio.

## Coisas que já foram decididas (não re-litigar sem motivo novo)

- SQLite em vez de PostgreSQL: máquina de entrega não tem Postgres instalado; schema é portável (documentado em `schema.prisma`).
- Sem login/multiusuário nesta versão (Configurações → Usuários explica que é evolução futura).
- Vendas importadas de NF-e nunca têm vendedor associado (dado não confiável no XML — não tentar parsear "Vendedor:" do texto livre `infCpl`).
- Produtos criados automaticamente por importação de NF-e nascem com `costPrice=0` (XML não traz custo) — completar manualmente em Configurações → Produtos.
