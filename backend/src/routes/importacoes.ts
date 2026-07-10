import { Router } from 'express';
import multer from 'multer';
import { ah, HttpError } from '../lib/http.js';
import { prisma } from '../db.js';
import { importNfeFromDirectory } from '../services/nfeImport.js';
import { commitExpenseImport, readSpreadsheetPreview } from '../services/expenseImport.js';

export const importacoesRouter = Router();

/* ---------------- NF-e ----------------
 * NFE_IMPORT_DIR ainda é uma única pasta global no .env (não por empresa) —
 * essa pasta é escaneada em nome da empresa que dispara o import, e todo
 * registro criado já nasce com o companyId de quem chamou. Pasta configurável
 * por empresa (armazenada em Company) é trabalho da Fase B do roadmap
 * multiempresa — ver plano salvo em C:\Users\Cliente\.claude\plans.
 */

importacoesRouter.get(
  '/nfe/status',
  ah(async (req, res) => {
    const companyId = req.companyId!;
    const dir = process.env.NFE_IMPORT_DIR ?? null;
    const ultima = await prisma.importedDocument.findFirst({
      where: { companyId, source: 'NFE' },
      orderBy: { importedAt: 'desc' },
    });
    const totalImportadas = await prisma.importedDocument.count({
      where: { companyId, source: 'NFE', status: 'IMPORTADO' },
    });
    const totalErros = await prisma.importedDocument.count({
      where: { companyId, source: 'NFE', status: 'ERRO' },
    });
    res.json({
      configured: dir !== null,
      dir,
      ultimaImportacao: ultima?.importedAt ?? null,
      totalImportadas,
      totalErros,
    });
  })
);

importacoesRouter.post(
  '/nfe/importar',
  ah(async (req, res) => {
    const dir = process.env.NFE_IMPORT_DIR;
    if (!dir) throw new HttpError(409, 'NFE_IMPORT_DIR não configurada no backend/.env');
    const results = await importNfeFromDirectory(dir, req.companyId!);
    const resumo = results.reduce((acc: Record<string, number>, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    res.json({ resumo, detalhes: results });
  })
);

/* ---------------- Domínio (despesas via planilha) ---------------- */

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

importacoesRouter.post(
  '/dominio/preview',
  upload.single('arquivo'),
  ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Nenhum arquivo enviado (campo "arquivo")');
    const preview = await readSpreadsheetPreview(req.file.buffer, req.file.originalname);
    res.json(preview);
  })
);

importacoesRouter.post(
  '/dominio/confirmar',
  upload.single('arquivo'),
  ah(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Nenhum arquivo enviado (campo "arquivo")');
    let mapping;
    try {
      mapping = JSON.parse(String(req.body.mapping ?? '{}'));
    } catch {
      throw new HttpError(400, 'Campo "mapping" precisa ser um JSON válido');
    }
    if (!mapping.dateColumn || !mapping.amountColumn) {
      throw new HttpError(400, 'Mapeamento incompleto: dateColumn e amountColumn são obrigatórios');
    }
    const result = await commitExpenseImport(req.file.buffer, req.file.originalname, mapping, req.companyId!);
    res.json(result);
  })
);
