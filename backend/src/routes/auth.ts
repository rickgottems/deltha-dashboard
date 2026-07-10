import { Router } from 'express';
import { prisma } from '../db.js';
import { ah, HttpError, requireString } from '../lib/http.js';
import { requireAuth } from '../lib/auth-middleware.js';
import { AUTH_COOKIE_NAME, hashPassword, signToken, verifyPassword } from '../services/auth.js';
import { ACCOUNT_TYPES } from '../lib/constants.js';

export const authRouter = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias, espelha o TTL do token
  path: '/',
};

// Regras de alerta padrão replicadas do seed de config (prisma/seed.ts) —
// toda empresa nova já nasce com esses limiares editáveis em Configurações → Alertas.
const DEFAULT_THRESHOLDS = [
  { metricKey: 'margem_liquida', label: 'Margem Líquida', unit: '%', yellowThreshold: 15, redThreshold: 10, direction: 'BELOW', scope: 'ambos' },
  { metricKey: 'margem_ebitda', label: 'Margem EBITDA', unit: '%', yellowThreshold: 20, redThreshold: 10, direction: 'BELOW', scope: 'ambos' },
  { metricKey: 'atingimento_meta_receita', label: 'Atingimento da meta de receita', unit: '%', yellowThreshold: 90, redThreshold: 70, direction: 'BELOW', scope: 'executivo' },
  { metricKey: 'fluxo_caixa', label: 'Fluxo de Caixa do mês', unit: 'R$', yellowThreshold: 5000, redThreshold: 0, direction: 'BELOW', scope: 'financeiro' },
  { metricKey: 'inadimplencia', label: 'Inadimplência', unit: '%', yellowThreshold: 3, redThreshold: 7, direction: 'ABOVE', scope: 'ambos' },
  { metricKey: 'comprometimento_receita', label: 'Despesas ÷ Receita', unit: '%', yellowThreshold: 80, redThreshold: 95, direction: 'ABOVE', scope: 'financeiro' },
  { metricKey: 'margem_contribuicao', label: 'Margem de Contribuição', unit: '%', yellowThreshold: 30, redThreshold: 15, direction: 'BELOW', scope: 'financeiro' },
];

authRouter.post(
  '/register',
  ah(async (req, res) => {
    const companyName = requireString(req.body.companyName, 'companyName');
    const name = requireString(req.body.name, 'name');
    const email = requireString(req.body.email, 'email').toLowerCase();
    const password = requireString(req.body.password, 'password');
    if (password.length < 8) throw new HttpError(400, 'Senha deve ter ao menos 8 caracteres');
    const accountType = req.body.accountType ? String(req.body.accountType) : 'EXTERNO';
    if (!ACCOUNT_TYPES.includes(accountType as any))
      throw new HttpError(400, `accountType deve ser um de: ${ACCOUNT_TYPES.join(', ')}`);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new HttpError(409, 'Já existe uma conta com este e-mail');

    const passwordHash = await hashPassword(password);

    const { company, user } = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: companyName, accountType, cnpj: req.body.cnpj ? String(req.body.cnpj) : null },
      });
      const user = await tx.user.create({
        data: { companyId: company.id, name, email, passwordHash },
      });
      // Empresa nova já nasce com os limiares de alerta padrão (mesmo papel do antigo db:seed).
      await tx.alertThreshold.createMany({
        data: DEFAULT_THRESHOLDS.map((t) => ({ ...t, companyId: company.id })),
      });
      return { company, user };
    });

    const token = signToken({ companyId: company.id, userId: user.id });
    res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS);
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email }, company });
  })
);

authRouter.post(
  '/login',
  ah(async (req, res) => {
    const email = requireString(req.body.email, 'email').toLowerCase();
    const password = requireString(req.body.password, 'password');

    const user = await prisma.user.findUnique({ where: { email }, include: { company: true } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, 'E-mail ou senha inválidos');
    }

    const token = signToken({ companyId: user.companyId, userId: user.id });
    res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({ user: { id: user.id, name: user.name, email: user.email }, company: user.company });
  })
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: undefined });
  res.status(204).end();
});

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { company: true },
    });
    if (!user) throw new HttpError(401, 'Sessão inválida');
    res.json({ user: { id: user.id, name: user.name, email: user.email }, company: user.company });
  })
);
