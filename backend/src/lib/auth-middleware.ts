import type { NextFunction, Request, Response } from 'express';
import { AUTH_COOKIE_NAME, verifyToken } from '../services/auth.js';
import { verifyApiKey } from '../services/apiKey.js';

// Aumenta o tipo Request do Express com o contexto de empresa/usuário
// autenticado, populado por `requireAuth` a partir do cookie de sessão OU
// de uma chave de API (req.userId fica undefined nesse segundo caso — não
// há usuário humano por trás de uma chamada máquina-a-máquina).
declare global {
  namespace Express {
    interface Request {
      companyId?: string;
      userId?: string;
    }
  }
}

/**
 * Exige autenticação válida — sessão (cookie httpOnly, fluxo humano no
 * navegador) OU chave de API (header `Authorization: Bearer dk_live_...`,
 * fluxo de scripts/robôs externos, ex.: importação automática do
 * escritório). Popula req.companyId (e req.userId quando aplicável) ou
 * responde 401.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const rawKey = authHeader.slice('Bearer '.length).trim();
    const companyId = await verifyApiKey(rawKey);
    if (!companyId) {
      res.status(401).json({ error: 'Chave de API inválida ou revogada.' });
      return;
    }
    req.companyId = companyId;
    next();
    return;
  }

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
