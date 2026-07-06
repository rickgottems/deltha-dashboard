import { Router } from 'express';
import { prisma } from '../db.js';
import { ah, optionalDate, requireDate, requireString } from '../lib/http.js';
import { currentYm, isValidYm, lastMonths, monthRange, ymLabel } from '../lib/period.js';

export const operacoesRouter = Router();

const DAY = 24 * 60 * 60 * 1000;

interface MonthOps {
  total: number;
  noPrazo: number;
  atrasadas: number; // entregues após o prazo + vencidas em aberto
  prazoMedioDias: number | null;
}

/**
 * Métricas operacionais do mês (base: tarefas com dueDate no mês, exceto
 * canceladas):
 *  - noPrazo: entregues com deliveredDate ≤ dueDate
 *  - atrasadas: entregues após o prazo OU vencidas sem entrega
 *  - prazoMedioDias: média de (deliveredDate − createdAt) das entregues
 */
async function monthOps(ym: string, teamId?: string): Promise<MonthOps> {
  const r = monthRange(ym);
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { gte: r.start, lt: r.end },
      status: { not: 'CANCELADA' },
      ...(teamId ? { teamId } : {}),
    },
  });
  let noPrazo = 0;
  let atrasadas = 0;
  let leadSum = 0;
  let leadCount = 0;
  for (const t of tasks) {
    if (t.deliveredDate) {
      if (t.deliveredDate.getTime() <= t.dueDate.getTime()) noPrazo++;
      else atrasadas++;
      leadSum += Math.max(0, (t.deliveredDate.getTime() - t.createdAt.getTime()) / DAY);
      leadCount++;
    } else if (t.dueDate.getTime() < now.getTime()) {
      atrasadas++;
    }
  }
  return {
    total: tasks.length,
    noPrazo,
    atrasadas,
    prazoMedioDias: leadCount > 0 ? leadSum / leadCount : null,
  };
}

/** GET /api/operacoes/summary?month=YYYY-MM */
operacoesRouter.get(
  '/summary',
  ah(async (req, res) => {
    const ym = isValidYm(String(req.query.month ?? '')) ? String(req.query.month) : currentYm();
    const prev = lastMonths(2, ym)[0];
    const r = monthRange(ym);

    const [atual, anterior, teams] = await Promise.all([
      monthOps(ym),
      monthOps(prev),
      prisma.team.findMany({ orderBy: { name: 'asc' } }),
    ]);

    // Produtividade por equipe: % de tarefas do mês entregues no prazo
    const equipes = await Promise.all(
      teams.map(async (team) => {
        const ops = await monthOps(ym, team.id);
        const encerradas = ops.noPrazo + ops.atrasadas;
        return {
          id: team.id,
          nome: team.name,
          produtividade: encerradas > 0 ? (ops.noPrazo / encerradas) * 100 : null,
          tarefas: ops.total,
        };
      })
    );

    const pct = (ops: MonthOps) => {
      const base = ops.noPrazo + ops.atrasadas;
      return base > 0 ? { noPrazo: (ops.noPrazo / base) * 100, atrasado: (ops.atrasadas / base) * 100 } : { noPrazo: null, atrasado: null };
    };
    const atualPct = pct(atual);
    const anteriorPct = pct(anterior);

    const comProdutividade = equipes.filter((e) => e.produtividade !== null);
    const produtividadeMedia =
      comProdutividade.length > 0
        ? comProdutividade.reduce((a, e) => a + (e.produtividade ?? 0), 0) / comProdutividade.length
        : null;

    // Série 12 meses: % no prazo x % atrasado (gráfico de LINHA)
    const months12 = lastMonths(12, ym);
    const serie = await Promise.all(
      months12.map(async (m) => {
        const ops = await monthOps(m);
        const p = pct(ops);
        return { label: ymLabel(m), noPrazo: p.noPrazo, atrasado: p.atrasado };
      })
    );

    // Gargalos: tarefas em atraso no mês agrupadas por motivo
    const now = new Date();
    const atrasadasMes = await prisma.task.findMany({
      where: {
        dueDate: { gte: r.start, lt: r.end },
        status: { not: 'CANCELADA' },
      },
    });
    const gargalos = new Map<string, number>();
    for (const t of atrasadasMes) {
      const late =
        (t.deliveredDate && t.deliveredDate.getTime() > t.dueDate.getTime()) ||
        (!t.deliveredDate && t.dueDate.getTime() < now.getTime());
      if (!late) continue;
      const reason = t.delayReason?.trim() || 'Sem motivo informado';
      gargalos.set(reason, (gargalos.get(reason) ?? 0) + 1);
    }

    res.json({
      month: ym,
      kpis: {
        produtividadeMedia: {
          value: produtividadeMedia,
          varPp: null, // calculado abaixo quando há histórico
        },
        prazoMedioDias: {
          value: atual.prazoMedioDias,
          varDias:
            atual.prazoMedioDias !== null && anterior.prazoMedioDias !== null
              ? atual.prazoMedioDias - anterior.prazoMedioDias
              : null,
        },
        pctNoPrazo: {
          value: atualPct.noPrazo,
          varPp:
            atualPct.noPrazo !== null && anteriorPct.noPrazo !== null
              ? atualPct.noPrazo - anteriorPct.noPrazo
              : null,
        },
        pctAtrasado: {
          value: atualPct.atrasado,
          varPp:
            atualPct.atrasado !== null && anteriorPct.atrasado !== null
              ? atualPct.atrasado - anteriorPct.atrasado
              : null,
        },
      },
      equipes: equipes.sort((a, b) => (b.produtividade ?? -1) - (a.produtividade ?? -1)),
      serie,
      gargalos: [...gargalos.entries()]
        .map(([motivo, quantidade]) => ({ motivo, quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade),
      totalTarefas: atual.total,
    });
  })
);

/** Tarefas do mês (para gestão simples na própria aba). */
operacoesRouter.get(
  '/tasks',
  ah(async (req, res) => {
    const ym = isValidYm(String(req.query.month ?? '')) ? String(req.query.month) : currentYm();
    const r = monthRange(ym);
    const rows = await prisma.task.findMany({
      where: { dueDate: { gte: r.start, lt: r.end } },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' },
    });
    res.json(
      rows.map((t) => ({
        id: t.id,
        titulo: t.title,
        equipe: t.team,
        prazo: t.dueDate.toISOString().slice(0, 10),
        entrega: t.deliveredDate ? t.deliveredDate.toISOString().slice(0, 10) : null,
        status: t.status,
        motivoAtraso: t.delayReason,
      }))
    );
  })
);

operacoesRouter.post(
  '/tasks',
  ah(async (req, res) => {
    const created = await prisma.task.create({
      data: {
        title: requireString(req.body.title, 'title'),
        teamId: req.body.teamId ? String(req.body.teamId) : null,
        dueDate: requireDate(req.body.dueDate, 'dueDate'),
        deliveredDate: optionalDate(req.body.deliveredDate),
        status: req.body.deliveredDate ? 'CONCLUIDA' : 'EM_ANDAMENTO',
        delayReason: req.body.delayReason ? String(req.body.delayReason) : null,
      },
    });
    res.status(201).json(created);
  })
);

operacoesRouter.put(
  '/tasks/:id',
  ah(async (req, res) => {
    const delivered = req.body.deliveredDate !== undefined ? optionalDate(req.body.deliveredDate) : undefined;
    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.title ? { title: String(req.body.title) } : {}),
        ...(req.body.teamId !== undefined ? { teamId: req.body.teamId || null } : {}),
        ...(req.body.dueDate ? { dueDate: requireDate(req.body.dueDate, 'dueDate') } : {}),
        ...(delivered !== undefined ? { deliveredDate: delivered, status: delivered ? 'CONCLUIDA' : 'EM_ANDAMENTO' } : {}),
        ...(req.body.status ? { status: String(req.body.status) } : {}),
        ...(req.body.delayReason !== undefined ? { delayReason: req.body.delayReason || null } : {}),
      },
    });
    res.json(updated);
  })
);

operacoesRouter.delete(
  '/tasks/:id',
  ah(async (req, res) => {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

/** Equipes. */
operacoesRouter.get(
  '/teams',
  ah(async (_req, res) => {
    res.json(await prisma.team.findMany({ orderBy: { name: 'asc' } }));
  })
);

operacoesRouter.post(
  '/teams',
  ah(async (req, res) => {
    const created = await prisma.team.create({ data: { name: requireString(req.body.name, 'name') } });
    res.status(201).json(created);
  })
);

operacoesRouter.delete(
  '/teams/:id',
  ah(async (req, res) => {
    await prisma.team.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
