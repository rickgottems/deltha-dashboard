// ============================================================
// Integração Google Calendar (OAuth2) — DEPENDÊNCIA EXTERNA OPCIONAL.
//
// Só fica ativa quando GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e
// GOOGLE_REDIRECT_URI existirem no .env (ver instruções lá).
// Sem credenciais, /api/calendar/status responde configured=false e a
// aba Calendário mostra o estado "não conectado" — NENHUMA outra aba
// depende desta integração. Um token por empresa (companyId, provider).
//
// Implementada com fetch nativo (Node 18+): authorization code flow com
// refresh token, tokens persistidos na tabela integration_tokens.
// ============================================================

import { prisma } from '../db.js';

const PROVIDER = 'google_calendar';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

export interface CalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getConfig(): CalendarConfig | null {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) return null;
  return {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: GOOGLE_REDIRECT_URI,
  };
}

export function missingEnvVars(): string[] {
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];
  return required.filter((k) => !process.env[k]);
}

export async function getStatus(companyId: string) {
  const config = getConfig();
  const token = await prisma.integrationToken.findUnique({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
  });
  return {
    configured: config !== null,
    connected: token !== null,
    missingEnvVars: missingEnvVars(),
  };
}

export function buildAuthUrl(companyId: string): string {
  const config = getConfig();
  if (!config) throw new Error('Google Calendar não configurado (.env)');
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    // companyId volta no callback do Google via "state" — é assim que
    // sabemos de qual empresa é o token quando o Google redireciona de volta.
    state: companyId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha na troca de token Google (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function handleCallback(code: string, companyId: string): Promise<void> {
  const config = getConfig();
  if (!config) throw new Error('Google Calendar não configurado (.env)');
  const data = await tokenRequest({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });
  const expiryDate = new Date(Date.now() + data.expires_in * 1000);
  await prisma.integrationToken.upsert({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
    create: {
      companyId,
      provider: PROVIDER,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiryDate,
      scope: data.scope ?? SCOPE,
    },
    update: {
      accessToken: data.access_token,
      // Google só devolve refresh_token no primeiro consentimento
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      expiryDate,
    },
  });
}

async function getValidAccessToken(companyId: string): Promise<string> {
  const config = getConfig();
  if (!config) throw new Error('Google Calendar não configurado (.env)');
  const token = await prisma.integrationToken.findUnique({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
  });
  if (!token) throw new Error('Google Calendar não conectado');

  const isExpired = token.expiryDate ? token.expiryDate.getTime() - Date.now() < 60_000 : true;
  if (!isExpired) return token.accessToken;

  if (!token.refreshToken) throw new Error('Token expirado e sem refresh token — reconectar');
  const data = await tokenRequest({
    refresh_token: token.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
  });
  await prisma.integrationToken.update({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
    data: {
      accessToken: data.access_token,
      expiryDate: new Date(Date.now() + data.expires_in * 1000),
    },
  });
  return data.access_token;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO (date ou dateTime)
  end: string;
  allDay: boolean;
  location: string | null;
  link: string | null;
}

export async function listEvents(timeMinIso: string, timeMaxIso: string, companyId: string): Promise<CalendarEvent[]> {
  const accessToken = await getValidAccessToken(companyId);
  const params = new URLSearchParams({
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao listar eventos (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { items?: any[] };
  return (json.items ?? []).map((e) => ({
    id: e.id,
    title: e.summary ?? '(sem título)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    allDay: Boolean(e.start?.date),
    location: e.location ?? null,
    link: e.htmlLink ?? null,
  }));
}

export async function disconnect(companyId: string): Promise<void> {
  const token = await prisma.integrationToken.findUnique({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
  });
  if (!token) return;
  // Melhor esforço: revogar no Google (não bloqueia a desconexão local)
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token.accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch {
    // offline ou token já inválido — seguir com a remoção local
  }
  await prisma.integrationToken.delete({ where: { companyId_provider: { companyId, provider: PROVIDER } } });
}
