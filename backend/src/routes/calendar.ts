// Aba Calendário — integração Google Calendar (OPCIONAL, ver services/calendar.ts).
// Sem credenciais no .env a rota /status informa configured=false e o
// frontend exibe o estado "Google Calendar não conectado".

import { Router } from 'express';
import { ah, HttpError } from '../lib/http.js';
import {
  buildAuthUrl,
  disconnect,
  getStatus,
  handleCallback,
  listEvents,
} from '../services/calendar.js';

export const calendarRouter = Router();

calendarRouter.get(
  '/status',
  ah(async (_req, res) => {
    res.json(await getStatus());
  })
);

calendarRouter.get(
  '/auth-url',
  ah(async (_req, res) => {
    const status = await getStatus();
    if (!status.configured) {
      throw new HttpError(
        409,
        `Google Calendar não configurado. Variáveis ausentes no backend/.env: ${status.missingEnvVars.join(', ')}`
      );
    }
    res.json({ url: buildAuthUrl() });
  })
);

/** Redirect URI do OAuth (configurar no Google Cloud Console). */
calendarRouter.get(
  '/callback',
  ah(async (req, res) => {
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const code = String(req.query.code ?? '');
    if (!code) {
      res.redirect(`${frontend}/calendario?error=${encodeURIComponent(String(req.query.error ?? 'sem_codigo'))}`);
      return;
    }
    try {
      await handleCallback(code);
      res.redirect(`${frontend}/calendario?connected=1`);
    } catch (err) {
      res.redirect(`${frontend}/calendario?error=${encodeURIComponent((err as Error).message)}`);
    }
  })
);

calendarRouter.get(
  '/events',
  ah(async (req, res) => {
    const status = await getStatus();
    if (!status.configured || !status.connected) {
      throw new HttpError(409, 'Google Calendar não conectado');
    }
    const now = new Date();
    const from = req.query.from
      ? new Date(`${req.query.from}T00:00:00.000Z`)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = req.query.to
      ? new Date(new Date(`${req.query.to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    res.json(await listEvents(from.toISOString(), to.toISOString()));
  })
);

calendarRouter.post(
  '/disconnect',
  ah(async (_req, res) => {
    await disconnect();
    res.json({ ok: true });
  })
);
