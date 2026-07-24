# Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm install && npm run build

# Build backend e run
FROM node:20-alpine
WORKDIR /app

# Copiar frontend buildado para a pasta pública do backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Instalar backend
COPY backend ./backend
WORKDIR /app/backend
RUN npm install

# Setup Prisma
RUN npx prisma generate

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app/backend
# `migrate deploy` aplica só migrations versionadas em `prisma/migrations/`
# (histórico ACID, nunca reseta/recria tabela) — substituiu `db push` agora
# que o banco (Supabase) é produção de verdade. Pré-requisito: a migration
# baseline (`0_init_supabase_production` ou timestamp equivalente) precisa
# estar marcada como aplicada no banco (`prisma migrate resolve --applied`)
# ANTES do primeiro deploy com este CMD, senão ele tenta recriar tabelas que
# já existem e falha.
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
