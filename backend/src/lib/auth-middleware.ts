import type { NextFunction, Request, Response } from 'express';
import { AUTH_COOKIE_NAME, verifyToken } from '../services/auth.js';

// Aumenta o tipo Request do Express com o contexto de empresa/usuário
// autenticado, populado por `requireAuth` a partir do cookie de sessão.
declare global {
  namespace Express {
    interface Request {
      companyId?: string;
      userId?: string;
    }
  }
}

/** Exige sessão válida (cookie httpOnly). Popula req.companyId/req.userId ou responde 401. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Sessão inválida ou expirada — faça login novamente.' });
    return;
  }
  req.companyId = payload.companyId;
  req.userId = payload.userId;
  next();
}
