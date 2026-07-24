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
      // undefined no fluxo de chave de API (M2M) — não há usuário humano por
      // trás, então não há papel para checar; requireBlockLeitura trata esse
      // caso como sempre permitido (ver abaixo).
      role?: 'ADMIN' | 'FINANCEIRO' | 'LEITURA';
    }
  }
}

/**
 * Exige autenticação válida — sessão (cookie httpOnly, fluxo humano no
 * navegador) OU chave de API (header `Authorization: Bearer dk_live_...`,
 * fluxo de scripts/robôs externos, ex.: importação automática do
 * escritório). Popula req.companyId (e req.userId/req.role quando aplicável)
 * ou responde 401.
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
  req.role = payload.role;
  next();
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Bloqueia escrita (POST/PUT/PATCH/DELETE) para usuário com role LEITURA.
 * Chamada de chave de API (req.role undefined — M2M não tem papel humano
 * associado) e leitura (GET) sempre passam. Deve rodar DEPOIS de requireAuth.
 */
export function requireBlockLeitura(req: Request, res: Response, next: NextFunction) {
  if (req.role === 'LEITURA' && WRITE_METHODS.has(req.method)) {
    res.status(403).json({ error: 'Seu usuário tem acesso somente leitura — esta ação exige permissão de edição.' });
    return;
  }
  next();
}
