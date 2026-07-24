// ============================================================
// Autenticação: hash de senha (bcryptjs) + JWT assinado, entregue em
// cookie httpOnly (não acessível via JS no navegador — mais seguro contra
// XSS que localStorage). O token carrega companyId + userId; toda rota
// autenticada usa esses dois campos para escopar as queries por empresa
// (ver lib/auth-middleware.ts).
// ============================================================

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não configurado no .env — obrigatório para assinar sessões.');
}

const TOKEN_TTL = '30d';
export const AUTH_COOKIE_NAME = 'deltha_session';

export interface TokenPayload {
  companyId: string;
  userId: string;
  role: 'ADMIN' | 'FINANCEIRO' | 'LEITURA';
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as TokenPayload;
  } catch {
    return null;
  }
}
