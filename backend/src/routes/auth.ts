import { Router } from 'express';
import { prisma } from '../db.js';
import { ah, HttpError, requireString } from '../lib/http.js';
import { requireAuth } from '../lib/auth-middleware.js';
import { AUTH_COOKIE_NAME, hashPassword, signToken, verifyPassword } from '../services/auth.js';
import { isValidCnpjFormat, lookupCnpj } from '../services/cnpjLookup.js';
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
  // Saúde Financeira (Balanço/DFC) — só avaliam quando a empresa lança esses dados (Configurações → Balanço & DFC)
  { metricKey: 'liquidez_seca', label: 'Liquidez Seca', unit: 'x', yellowThreshold: 1.0, redThreshold: 0.3, direction: 'BELOW', scope: 'financeiro' },
  { metricKey: 'liquidez_corrente', label: 'Liquidez Corrente', unit: 'x', yellowThreshold: 1.2, redThreshold: 1.0, direction: 'BELOW', scope: 'financeiro' },
  { metricKey: 'alavancagem_ebitda', label: 'Alavancagem (Dívida Líquida ÷ EBITDA)', unit: 'x', yellowThreshold: 3.0, redThreshold: 3.5, direction: 'ABOVE', scope: 'financeiro' },
  { metricKey: 'cobertura_juros_bp', label: 'Cobertura de Juros', unit: 'x', yellowThreshold: 2.0, redThreshold: 1.5, direction: 'BELOW', scope: 'financeiro' },
  { metricKey: 'capex_sobre_lucro', label: 'CAPEX ÷ Lucro Líquido', unit: '%', yellowThreshold: 30, redThreshold: 40, direction: 'ABOVE', scope: 'financeiro' },
  { metricKey: 'runway_meses', label: 'Runway de Caixa', unit: 'meses', yellowThreshold: 12, redThreshold: 8, direction: 'BELOW', scope: 'financeiro' },
];

/**
 * GET /api/auth/cnpj-lookup/:cnpj — público (não exige login, é usado na
 * própria tela de cadastro). Consulta dado cadastral público na Receita
 * Federal via BrasilAPI — não retorna nada financeiro/fiscal (ver
 * services/cnpjLookup.ts).
 */
authRouter.get(
  '/cnpj-lookup/:cnpj',
  ah(async (req, res) => {
    const info = await lookupCnpj(req.params.cnpj);
    if (!info) throw new HttpError(404, 'CNPJ não encontrado ou inválido');
    res.json(info);
  })
);

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
    const cnpj = requireString(req.body.cnpj, 'cnpj').replace(/\D/g, '');
    if (!isValidCnpjFormat(cnpj)) throw new HttpError(400, 'CNPJ inválido — precisa ter 14 dígitos');

    const [existingUser, existingCompany] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.company.findUnique({ where: { cnpj } }),
    ]);
    if (existingUser) throw new HttpError(409, 'Já existe uma conta com este e-mail');
    if (existingCompany) throw new HttpError(409, 'Já existe uma empresa cadastrada com este CNPJ');

    const passwordHash = await hashPassword(password);

    const { company, user } = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: companyName, accountType, cnpj },
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

/**
 * POST /api/auth/login — aceita `identifier` como e-mail OU CNPJ (detectado
 * pelo formato: contém "@" → e-mail; senão, dígitos → CNPJ da empresa).
 * Login por CNPJ busca a empresa e usa o primeiro usuário dela (v1: 1
 * usuário por empresa, criado no cadastro).
 */
authRouter.post(
  '/login',
  ah(async (req, res) => {
    const identifier = requireString(req.body.identifier, 'identifier');
    const password = requireString(req.body.password, 'password');

    let user;
    if (identifier.includes('@')) {
      user = await prisma.user.findUnique({ where: { email: identifier.toLowerCase() }, include: { company: true } });
    } else {
      const cnpj = identifier.replace(/\D/g, '');
      const company = await prisma.company.findUnique({ where: { cnpj } });
      user = company
        ? await prisma.user.findFirst({ where: { companyId: company.id }, include: { company: true } })
        : null;
    }

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, 'Credenciais inválidas');
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
