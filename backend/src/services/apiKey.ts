// ============================================================
// Chaves de API — ver nota completa em prisma/schema.prisma (model ApiKey).
// Diferente de senha de usuário: a chave já nasce com entropia alta
// (32 bytes aleatórios), então SHA-256 simples é suficiente e muito mais
// rápido que bcrypt para validar em toda requisição — bcrypt existe pra
// proteger senhas curtas/fracas escolhidas por humanos, não é o caso aqui.
// ============================================================

import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../db.js';

const KEY_PREFIX = 'dk_live_';

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/** Gera uma chave nova. A string completa (rawKey) só existe aqui — nunca é salva. */
export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const secret = randomBytes(24).toString('hex'); // 48 chars hex
  const rawKey = `${KEY_PREFIX}${secret}`;
  return {
    rawKey,
    keyHash: hashKey(rawKey),
    keyPrefix: rawKey.slice(0, KEY_PREFIX.length + 6), // ex: "dk_live_ab12cd"
  };
}

/** Verifica uma chave recebida via header e devolve o companyId dono dela (ou null). */
export async function verifyApiKey(rawKey: string): Promise<string | null> {
  if (!rawKey.startsWith(KEY_PREFIX)) return null;
  const keyHash = hashKey(rawKey);
  const key = await prisma.apiKey.findUnique({ where: { keyHash } });
  if (!key || key.revokedAt) return null;
  // Best-effort, não bloqueia a resposta
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return key.companyId;
}
