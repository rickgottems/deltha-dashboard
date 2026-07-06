# Deltha — Dashboard Empresarial

Dashboard corporativo dark (accent âmbar `#FF8A00`) com 10 abas: **Executivo** (tela inicial),
Financeiro, Receitas, Despesas, Vendas, Clientes, Operações, Calendário, Relatórios e Configurações.

**Nenhum dado é mockado no código** — tudo vem do banco relacional via API, mesmo que vazio no início.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v4 + Recharts + Framer Motion + lucide-react |
| Backend | Node.js + Express 4 + TypeScript (tsx) |
| ORM / Banco | Prisma 6 + **SQLite** (arquivo local `backend/prisma/deltha.db`) |
| Exportação | exceljs (Excel) + pdfkit (PDF) |
| Importação | fast-xml-parser (NF-e) + exceljs/CSV próprio (planilha Domínio) + multer (upload) |

> **PostgreSQL**: o schema foi escrito portável (sem enums nativos). Para migrar:
> 1. `backend/prisma/schema.prisma` → `provider = "postgresql"`
> 2. `backend/.env` → `DATABASE_URL="postgresql://user:senha@localhost:5432/deltha"`
> 3. `npx prisma migrate dev`

## Como rodar

```bash
# Terminal 1 — API (porta 3001)
cd backend
npm install          # primeira vez
npm run dev

# Terminal 2 — Frontend (porta 5173)
cd frontend
npm install          # primeira vez
npm run dev
```

Abra http://localhost:5173 — a aba **Executivo** carrega por padrão.

### Scripts úteis (backend)

| Comando | Efeito |
|---|---|
| `npm run db:migrate` | Aplica migrations |
| `npm run db:seed` | Garante regras de alerta padrão (configuração, não dado de negócio) |
| `npm run db:demo` | **Opcional**: popula 12 meses de dados FICTÍCIOS de demonstração |
| `npm run db:reset` | Zera o banco e reaplica migrations + seed de configuração |
| `npm run db:studio` | Prisma Studio (inspeção visual do banco) |

O banco é entregue **vazio** (apenas regras de alerta padrão). Para apresentar o sistema com
dados: `npm run db:demo`. Para voltar ao zero: `npm run db:reset`.

## Modelo de dados (Prisma)

`clients` (com `cnpj` opcional, chave de upsert da importação de NF-e), `receivables`
(receitas/cobranças — também é o histórico usado pelo score de risco), `expenses` (com
classificação DRE), `products` (cost_price/sale_price), `sales`, `sellers`, `teams`, `tasks`
(operações/gargalos), `alert_thresholds` (regras de alerta configuráveis), `goals` (metas por
métrica/mês), `integration_tokens` (OAuth Google), `imported_documents` (deduplicação das
importações de NF-e e planilha Domínio). `receivables`/`sales`/`expenses` têm um campo `source`
(`MANUAL`/`NFE`/`DOMINIO`) que alimenta o badge de origem na UI.

### Fórmulas (DRE gerencial simplificada v1 — documentadas em `backend/src/services/finance.ts`)

- **Receita Bruta** = Σ receivables com vencimento no período (status ≠ CANCELADA) — competência
- **Receita Líquida** = Bruta − despesas `DEDUCAO`
- **Lucro Operacional = Lucro Líquido (v1)** = Líquida − `CUSTO` − (`OPERACIONAL`+`DEPRECIACAO`) − (`OUTRA`+`FINANCEIRA`)
- **EBITDA** = Lucro Operacional + `DEPRECIACAO` + `FINANCEIRA`
- **Fluxo de Caixa** = recebimentos (paid_date) − despesas do mês (regime caixa)
- **Margem de contribuição** (Executivo) = média de `(sale_price − cost_price) ÷ sale_price` dos produtos ativos
- **Inadimplência** = valor vencido não pago ÷ faturamento (12 meses móveis)

### Score de risco de inadimplência — heurística v1 (NÃO é ML)

Documentado em `backend/src/services/risk.ts`: % de faturas pagas com atraso/vencidas em aberto
nos últimos 12 meses + média de dias de atraso → Baixo / Médio / Alto. É intencionalmente uma
regra determinística e auditável; não evoluir para "IA preditiva" sem decisão explícita.

## Regras configuráveis (nunca hardcoded)

- **Alertas** (crítico/atenção/confortável): Configurações → Alertas → tabela `alert_thresholds`.
  Direção `BELOW` (abaixo é ruim, ex.: margem) ou `ABOVE` (acima é ruim, ex.: inadimplência).
- **Metas** (receita, vendas, lucro, novos clientes): Configurações → Metas → tabela `goals`
  (meta padrão + sobrescrita por mês).

## Google Calendar (integração OPCIONAL — requer credenciais externas)

A aba Calendário funciona em modo **"não conectado"** sem quebrar nada. Para ativar:

1. Criar projeto no [Google Cloud Console](https://console.cloud.google.com)
2. Ativar a **Google Calendar API**
3. Configurar a tela de consentimento OAuth
4. Criar **OAuth Client ID** (Web) com redirect URI `http://localhost:3001/api/calendar/callback`
5. Preencher no `backend/.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
6. Reiniciar o backend e clicar em "Conectar Google Calendar" na aba

Tokens ficam na tabela `integration_tokens`; desconectar revoga e apaga.

## Importação automática de dados (reduzir digitação manual)

Duas fontes alimentam o Deltha sem exigir lançamento manual, geridas em
**Configurações → Integrações**:

### 1. NF-e de saída (XML) — receitas, vendas e clientes automáticos

Um robô Python separado ("Automação notas sieg", outro repositório) baixa os XMLs de NF-e do
portal SIEG e salva em `E:\FISCAL\[EMPRESA]\[ANO]\01-Apurações\[MM]\NF-e\Saídas\*.xml` no
servidor do escritório. O Deltha lê essa pasta e transforma cada nota em `Client` (upsert por
CNPJ), `Product` (upsert por nome), `Sale` (1 por item da nota) e `Receivable` (1 por parcela,
ou 1 único para venda à vista) — automaticamente, sem digitação.

- **Configurar**: definir `NFE_IMPORT_DIR` no `backend/.env` apontando para a pasta desta empresa
  (pode apontar para o nível `01-Apurações` para varrer todos os meses de uma vez — a busca é
  recursiva). Sem essa variável, o card de NF-e em Configurações → Integrações mostra
  "não configurado" e nenhuma outra tela é afetada.
- **Importar manualmente**: botão "Importar agora" em Configurações → Integrações, ou via CLI:
  ```bash
  cd backend
  npm run import:nfe -- "E:\FISCAL\NOME_EMPRESA\2026\01-Apurações"
  ```
- **Agendamento em produção (Windows Task Scheduler)**: criar uma tarefa que roda
  `npm run import:nfe` (sem argumento — usa `NFE_IMPORT_DIR` do `.env`) todo dia, num horário
  depois do robô SIEG já ter salvo os XMLs (ex.: SIEG às 6h, Deltha às 7h).
- **Idempotência**: cada nota é identificada pela chave de acesso (44 dígitos, tabela
  `imported_documents`) — rodar a importação várias vezes nunca duplica dados.
- **Cada empresa-cliente do escritório = 1 instância própria do Deltha** (backend+frontend+SQLite
  independentes), com seu próprio `NFE_IMPORT_DIR` apontando só para a pasta dela — não há
  visão consolidada entre empresas (decisão de escopo).

**Limitações conhecidas** (documentadas também no código):
- Produtos criados automaticamente nascem com `costPrice=0` (o XML não traz preço de custo) —
  completar manualmente em Configurações → Produtos, senão a margem de contribuição desse
  produto aparece distorcida (100%) no Executivo.
- Vendas importadas nunca têm vendedor associado (o campo "Vendedor:" às vezes presente em texto
  livre no XML é inconsistente entre sistemas emissores — não é parseado).
- A soma de `Sale.amount` de uma nota pode não bater 100% com o valor total da NF-e (frete/desconto
  não distribuído por item) — o DRE usa `Receivable`, não a soma de `Sale`, para receita reconhecida.

### 2. Despesas do sistema Domínio — planilha com mapeamento de colunas

O Domínio Sistemas (ERP contábil) não tem API — só exportação manual (Excel/CSV) pela tela. Em
Configurações → Integrações → "Importar planilha do Domínio", o usuário sobe o arquivo exportado,
escolhe visualmente quais colunas correspondem a data/valor/descrição/categoria/classificação DRE
(sem parser fixo, já que o formato real do Domínio varia) e confirma. Reenviar o mesmo arquivo por
engano é seguro: cada linha é identificada por um hash (data+valor+descrição) e linhas repetidas
são silenciosamente ignoradas.

Este fluxo permanece sempre manual (login no Domínio → exportar → subir no Deltha) — não há forma
de automatizar mais que isso sem uma API do Domínio, que não existe hoje.

### Origem dos lançamentos (badge visual)

Receitas e Despesas mostram uma coluna "Origem" (`MANUAL` / `NF-e` / `Domínio`) distinguindo o que
foi digitado do que veio de importação automática — mesmo campo `source` já vem na resposta da API
de Vendas para uso futuro, mas a tela de Vendas hoje só exibe agregados (ranking, produtos mais
vendidos), sem lista bruta de vendas individuais onde o badge caiba.

## Decisões da v1 (registradas)

- **SQLite** em vez de PostgreSQL: o PostgreSQL não está instalado na máquina de entrega; o
  schema é portável e a troca está documentada acima.
- **Usuário único local**, sem login: gestão de usuários/permissões é evolução prevista
  (Configurações → Usuários explica). O protótipo anterior (`../Interface Completa Saas.tsx`)
  foi mantido intacto como referência e não é usado pelo app.
- Valores monetários como `Float` (suficiente para dashboard gerencial v1; migrar para
  centavos inteiros se houver conciliação contábil).
- Datas em UTC no backend (agregações mensais estáveis).
- **Sem autenticação** (consistente com "usuário único local" acima): a API escuta em todas as
  interfaces de rede por padrão, para permitir que a equipe do escritório acesse de suas próprias
  máquinas apontando para o IP do servidor. Isso significa que qualquer dispositivo na mesma rede
  alcança a API sem senha — aceitável para uma rede interna de confiança, mas defina `HOST=127.0.0.1`
  no `backend/.env` se o servidor estiver numa rede compartilhada com máquinas não confiáveis.
