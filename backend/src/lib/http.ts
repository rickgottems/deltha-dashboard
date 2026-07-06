import type { NextFunction, Request, Response } from 'express';

/** Envolve handlers async para que erros caiam no error handler do Express. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `Campo obrigatório: ${field}`);
  }
  return value.trim();
}

export function requireNumber(value: unknown, field: string): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new HttpError(400, `Campo numérico inválido: ${field}`);
  }
  return n;
}

export function optionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `Data inválida: ${String(value)}`);
  return d;
}

export function requireDate(value: unknown, field: string): Date {
  const d = optionalDate(value);
  if (!d) throw new HttpError(400, `Campo de data obrigatório: ${field}`);
  return d;
}
