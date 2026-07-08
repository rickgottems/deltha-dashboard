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
# Cria/atualiza as tabelas do SQLite antes de subir o servidor (o container
# não tem banco nenhum na primeira execução — migrate deploy cria do zero).
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
