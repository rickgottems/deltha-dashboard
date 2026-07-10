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
# `db push` (não `migrate deploy`) porque ainda não há histórico de migrations
# versionado para Postgres (banco multiempresa novo, sem dado real de cliente
# a proteger ainda) — sincroniza o schema direto. SEM --accept-data-loss de
# propósito: se um deploy futuro tentar uma mudança que perderia dados reais,
# o comando FALHA em vez de apagar silenciosamente — trocar para migrations
# versionadas (prisma migrate) antes de operar com dados reais em produção.
CMD ["sh", "-c", "npx prisma db push && npm start"]
