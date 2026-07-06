import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { HttpError } from './lib/http.js';
import { executivoRouter } from './routes/executivo.js';
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

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

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

app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

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

// Sem host explícito, Express escuta em todas as interfaces (0.0.0.0) — é o
// que permite a equipe do escritório acessar o dashboard de suas próprias
// máquinas apontando para o IP do servidor (topologia real de uso). Esse
// mesmo comportamento também expõe a API, sem autenticação, a qualquer
// dispositivo na mesma rede. Para restringir a acessos só da própria máquina
// (ex.: ambiente de desenvolvimento, ou quando o acesso da equipe for só via
// um proxy/túnel autenticado na frente), defina HOST=127.0.0.1 no .env.
const host = process.env.HOST;
const onListening = () => console.log(`✔ API Deltha rodando em http://${host ?? 'localhost'}:${port}`);
if (host) app.listen(port, host, onListening);
else app.listen(port, onListening);
