import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { HttpError } from './lib/http.js';
import { requireAuth } from './lib/auth-middleware.js';
import { authRouter } from './routes/auth.js';
import { executivoRouter } from './routes/executivo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { financeiroRouter } from './routes/financeiro.js';
import { receitasRouter } from './routes/receitas.js';
import { despesasRouter } from './routes/despesas.js';
import { vendasRouter } from './routes/vendas.js';
import { clientesRouter } from './routes/clientes.js';
import { operacoesRouter } from './routes/operacoes.js';
import { calendarRouter } from './routes/calendar.js';
import { relatoriosRouter } from './routes/relatorios.js';
import { configRouter } from './routes/config.js';
import { importacoesRouter } from './routes/importacoes.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// /api/auth/* é público (registro e login não podem exigir sessão prévia).
// Toda rota abaixo dele exige sessão válida — ver lib/auth-middleware.ts.
app.use('/api/auth', authRouter);
app.use('/api', requireAuth);

app.use('/api/executivo', executivoRouter);
app.use('/api/financeiro', financeiroRouter);
app.use('/api/receitas', receitasRouter);
app.use('/api/despesas', despesasRouter);
app.use('/api/vendas', vendasRouter);
app.use('/api/clientes', clientesRouter);
app.use('/api/operacoes', operacoesRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/relatorios', relatoriosRouter);
app.use('/api/config', configRouter);
app.use('/api/importacoes', importacoesRouter);

// Servir arquivos estáticos do frontend buildado
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// SPA fallback: redireciona URLs não-API para index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('[api] erro não tratado:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
);

// Sem host explícito, Express escuta em todas as interfaces (0.0.0.0). Toda
// rota /api/* (exceto /api/health e /api/auth/*) exige sessão válida — ver
// lib/auth-middleware.ts — e cada empresa só enxerga seus próprios dados
// (companyId do token, nunca do corpo da requisição).
const host = process.env.HOST;
const onListening = () => console.log(`✔ API Deltha rodando em http://${host ?? 'localhost'}:${port}`);
if (host) app.listen(port, host, onListening);
else app.listen(port, onListening);
