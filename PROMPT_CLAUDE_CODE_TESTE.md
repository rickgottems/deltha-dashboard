# Prompt para o Claude Code (terminal) — sessão de teste com documentos reais

Copie tudo abaixo da linha e cole como primeira mensagem numa sessão nova do Claude Code,
rodando na pasta `deltha-dashboard`. Anexe os documentos (DRE, DFC, Balanço, etc.) na mesma
mensagem ou vá anexando conforme ele pedir.

---

Você é um engenheiro de software sênior assumindo a manutenção do **Radar Deltha**, um SaaS
financeiro multiempresa. ANTES de qualquer ação, leia o arquivo `CLAUDE.md` na raiz do projeto
inteiro — ele é a fonte de verdade da arquitetura, das regras de negócio e das decisões já
tomadas. Leia também `RESUMO_PRODUTO_RADAR_DELTHA.md` (visão de produto) e
`RELATORIO_TECNICO_RADAR_DELTHA.md` (detalhe técnico) se existirem. Não presuma nada sobre o
sistema sem antes ler esses arquivos.

## Contexto do negócio (resumo — o detalhe está no CLAUDE.md)

- Dashboard financeiro SaaS multiempresa. Cada empresa se cadastra, faz login e só vê os
  próprios dados. Toda tabela de negócio tem `companyId` e é sempre filtrada por ele.
- O motor financeiro (DRE gerencial, Score de Saúde Financeira, Ponto de Equilíbrio, risco de
  inadimplência, alertas) é **heurística determinística e auditável — NUNCA "IA" ou previsão
  estatística**. Isso é uma regra dura do dono do produto: não chame nada disso de IA no código
  nem na interface, e não introduza machine learning. Toda regra nova segue os princípios já
  documentados em `services/dreAlerts.ts`, `services/healthScore.ts` e `services/finance.ts` —
  compare contra o que já existe e NÃO crie um motor paralelo duplicado.
- Balanço Patrimonial e DFC são **lançados manualmente por empresa + mês** (não são deriváveis
  de receitas/despesas). Existe tabela e rota de CRUD pra isso (`routes/balanco.ts`,
  `services/healthScore.ts` → `validateBalanceSheet`, que valida a equação contábil
  Ativo = Passivo + PL e rejeita valores negativos indevidos).

## O que eu tenho e o que quero nesta sessão

Tenho documentos contábeis reais para popular o sistema e testá-lo de ponta a ponta: **DRE,
DFC, Balanço Patrimonial, Demonstrações Contábeis e Faturamento**. Eles são de **períodos
distintos** e servem SÓ para teste — não precisam formar uma série temporal coerente entre si.

Seu trabalho:

1. **Primeiro, leia os documentos que eu anexar e me mostre como você interpretou cada um**
   antes de gravar qualquer coisa. Para cada documento, identifique: de qual período ele é, e
   quais campos do nosso schema ele preenche (ex.: o Balanço preenche `BalanceSheet`
   — ativo circulante, estoques, passivo circulante, caixa, dívida, PL; o DFC preenche
   `CashFlowStatement`; o Faturamento vira `Receivable`/`Sale`; a DRE serve para conferir se os
   números do nosso DRE gerencial batem). **Me apresente esse mapeamento em tabela e espere
   minha confirmação antes de inserir dados.** Se algum valor do documento não tiver campo
   correspondente no schema, me diga — não invente campo nem force o dado.

2. **Como inserir os dados de teste**: descubra, lendo o código, a forma correta e mais segura
   de popular o banco de uma empresa de teste (ex.: um script de seed dedicado a uma "Empresa
   Demo", as rotas autenticadas da API, ou lançamento manual pela interface). **Nunca** insira
   dado de teste misturado a dados de outra empresa; crie/reutilize uma empresa de teste isolada.
   Respeite o isolamento multiempresa em toda query (`companyId` sempre presente).

3. **Você tem autonomia para mexer na infraestrutura** (Supabase e Railway) quando for
   necessário para o teste funcionar — schema Prisma, migrations, variáveis de ambiente, deploy.
   Mas siga estas regras de segurança, que são inegociáveis:
   - O banco (Supabase) é **produção**. Proibido `prisma db push`. Mudança de schema só via
     migration versionada em `backend/prisma/migrations/`. Para gerar o SQL de uma migration nova
     sem arriscar o banco, use
     `npx prisma migrate diff --from-schema-datamodel <schema-anterior> --to-schema-datamodel prisma/schema.prisma --script`
     e revise o SQL antes de aplicar.
   - **Nunca** rode um comando destrutivo (reset, drop, `--accept-data-loss`, truncate) sem me
     mostrar exatamente o comando e esperar meu "pode rodar".
   - Se um comando precisar de segredo de produção (senha do banco, service_role key, token do
     Railway), **não peça o segredo para você digitar** — me entregue o comando exato pronto para
     eu mesmo colar e rodar (ex.: via `railway run ...`), e eu te devolvo a saída.
   - Percentuais/senhas em connection string do Postgres precisam estar percent-encoded
     (`#`→`%23` etc.) — se aparecer erro de porta inválida (P1013) ou de conexão (P1001), a causa
     costuma ser encoding ou uso do host direto do Supabase em vez do pooler. O Railway só tem
     saída IPv4, então use sempre o Connection Pooler do Supabase (`DATABASE_URL` no pooler modo
     transação porta 6543 com `?pgbouncer=true`; `DIRECT_URL` no pooler modo sessão porta 5432).

4. **Há uma pendência em aberto da última sessão**: a migration baseline já foi gerada localmente
   e o `Dockerfile` já aponta para `npx prisma migrate deploy`, mas o banco de produção ainda
   precisa ser marcado como "já migrado" antes do próximo deploy, senão ele tenta recriar tabelas
   que já existem e quebra. Confirme o estado rodando (ou me passando para rodar)
   `npx prisma migrate status` com as variáveis de produção, e me diga se falta rodar
   `npx prisma migrate resolve --applied <nome-da-migration-baseline>` antes de qualquer deploy.
   Só siga com deploy depois que o `migrate status` estiver limpo.

5. **Fluxo de trabalho que eu espero de você em toda mudança**:
   - Rode `npx tsc --noEmit` no `backend` e no `frontend` e me mostre que passou limpo.
   - Para mudanças visíveis na interface, verifique você mesmo (subindo o app / preview) em vez de
     me pedir para conferir manualmente.
   - Faça commits pequenos e descritivos, **mas só faça push/deploy quando eu autorizar**.
   - Ao terminar cada bloco, me diga o que mudou, o que testou e qual é o próximo passo — em
     português, direto ao ponto.

Comece agora: leia `CLAUDE.md` e os demais arquivos de contexto, depois me diga que entendeu o
sistema e me peça os documentos (ou leia os que eu já anexei) e apresente o mapeamento da tarefa
1 antes de gravar qualquer dado.
