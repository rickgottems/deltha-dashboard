// Exportação de relatórios (aba Relatórios): Excel (exceljs) e PDF (pdfkit),
// por aba e por período. Os datasets vêm 100% do banco.

import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../db.js';
import { ymOf, type Range } from '../lib/period.js';
import { monthFinance } from './finance.js';
import { riskByClient } from './risk.js';

export interface ReportSection {
  heading: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface ReportData {
  title: string;
  periodLabel: string;
  sections: ReportSection[];
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const D = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');

function monthsInRange(r: Range): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(r.start.getUTCFullYear(), r.start.getUTCMonth(), 1));
  while (cur < r.end) {
    out.push(ymOf(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out.slice(-24); // proteção: máximo 24 meses por relatório
}

export async function buildReport(tab: string, r: Range, companyId: string): Promise<ReportData> {
  const periodLabel = `${D(r.start)} a ${D(new Date(r.end.getTime() - 1))}`;

  switch (tab) {
    case 'receitas': {
      const rows = await prisma.receivable.findMany({
        where: { companyId, dueDate: { gte: r.start, lt: r.end } },
        include: { client: true },
        orderBy: { dueDate: 'asc' },
      });
      const byCat = new Map<string, number>();
      for (const row of rows.filter((x) => x.status !== 'CANCELADA'))
        byCat.set(row.category, (byCat.get(row.category) ?? 0) + row.amount);
      return {
        title: 'Relatório de Receitas',
        periodLabel,
        sections: [
          {
            heading: 'Receitas por categoria',
            columns: ['Categoria', 'Valor'],
            rows: [...byCat.entries()].map(([c, v]) => [c, BRL(v)]),
          },
          {
            heading: 'Lançamentos',
            columns: ['Vencimento', 'Cliente', 'Categoria', 'Descrição', 'Status', 'Pagamento', 'Valor'],
            rows: rows.map((x) => [
              D(x.dueDate),
              x.client?.name ?? '—',
              x.category,
              x.description ?? '—',
              x.status,
              x.paidDate ? D(x.paidDate) : '—',
              BRL(x.amount),
            ]),
          },
        ],
      };
    }
    case 'despesas': {
      const rows = await prisma.expense.findMany({
        where: { companyId, date: { gte: r.start, lt: r.end } },
        orderBy: { date: 'asc' },
      });
      const byCat = new Map<string, number>();
      for (const row of rows) byCat.set(row.category, (byCat.get(row.category) ?? 0) + row.amount);
      return {
        title: 'Relatório de Despesas',
        periodLabel,
        sections: [
          {
            heading: 'Despesas por categoria',
            columns: ['Categoria', 'Valor'],
            rows: [...byCat.entries()].map(([c, v]) => [c, BRL(v)]),
          },
          {
            heading: 'Lançamentos',
            columns: ['Data', 'Categoria', 'Classificação DRE', 'Descrição', 'Valor'],
            rows: rows.map((x) => [D(x.date), x.category, x.kind, x.description ?? '—', BRL(x.amount)]),
          },
        ],
      };
    }
    case 'financeiro':
    case 'executivo': {
      const months = monthsInRange(r);
      const series = await Promise.all(months.map((ym) => monthFinance(ym, companyId)));
      return {
        title: tab === 'executivo' ? 'Relatório Executivo' : 'Relatório Financeiro',
        periodLabel,
        sections: [
          {
            heading: 'DRE gerencial por mês',
            columns: [
              'Mês', 'Receita Bruta', 'Deduções', 'Receita Líquida', 'Custos',
              'Desp. Operacionais', 'Outras', 'Lucro Líquido', 'EBITDA',
              'Margem Líq. %', 'Fluxo de Caixa',
            ],
            rows: series.map((f) => [
              f.label,
              BRL(f.receitaBruta),
              BRL(f.deducoes),
              BRL(f.receitaLiquida),
              BRL(f.custos),
              BRL(f.despesasOperacionais),
              BRL(f.outras),
              BRL(f.lucroLiquido),
              BRL(f.ebitda),
              f.margemLiquida === null ? '—' : f.margemLiquida.toFixed(1),
              BRL(f.fluxoCaixa),
            ]),
          },
        ],
      };
    }
    case 'vendas': {
      const sales = await prisma.sale.findMany({
        where: { companyId, date: { gte: r.start, lt: r.end } },
        include: { product: true, client: true, seller: true },
        orderBy: { date: 'asc' },
      });
      const byProduct = new Map<string, { total: number; qty: number }>();
      for (const s of sales) {
        const name = s.product?.name ?? '(sem produto)';
        const cur = byProduct.get(name) ?? { total: 0, qty: 0 };
        cur.total += s.amount;
        cur.qty += s.quantity;
        byProduct.set(name, cur);
      }
      return {
        title: 'Relatório de Vendas',
        periodLabel,
        sections: [
          {
            heading: 'Produtos mais vendidos',
            columns: ['Produto', 'Faturamento', 'Quantidade'],
            rows: [...byProduct.entries()]
              .sort((a, b) => b[1].total - a[1].total)
              .map(([name, v]) => [name, BRL(v.total), v.qty]),
          },
          {
            heading: 'Vendas do período',
            columns: ['Data', 'Produto', 'Cliente', 'Vendedor', 'Qtd', 'Valor'],
            rows: sales.map((s) => [
              D(s.date),
              s.product?.name ?? '—',
              s.client?.name ?? '—',
              s.seller?.name ?? '—',
              s.quantity,
              BRL(s.amount),
            ]),
          },
        ],
      };
    }
    case 'clientes': {
      const [clients, risks] = await Promise.all([
        prisma.client.findMany({ where: { companyId }, include: { sales: true, receivables: true } }),
        riskByClient(companyId),
      ]);
      return {
        title: 'Relatório de Clientes',
        periodLabel: 'Base completa',
        sections: [
          {
            heading: 'Clientes, compras e risco de inadimplência (heurística v1)',
            columns: ['Cliente', 'E-mail', 'Total comprado', 'Faturas', '% atraso', 'Risco'],
            rows: clients
              .map((c) => {
                const total = c.sales.reduce((a, s) => a + s.amount, 0);
                const risk = risks.get(c.id);
                return {
                  total,
                  row: [
                    c.name,
                    c.email ?? '—',
                    BRL(total),
                    risk?.totalFaturas ?? 0,
                    risk?.pctAtraso === null || risk?.pctAtraso === undefined
                      ? '—'
                      : `${risk.pctAtraso.toFixed(0)}%`,
                    risk?.level ?? 'SEM_HISTORICO',
                  ] as (string | number)[],
                };
              })
              .sort((a, b) => b.total - a.total)
              .map((x) => x.row),
          },
        ],
      };
    }
    case 'operacoes': {
      const tasks = await prisma.task.findMany({
        where: { companyId, dueDate: { gte: r.start, lt: r.end } },
        include: { team: true },
        orderBy: { dueDate: 'asc' },
      });
      return {
        title: 'Relatório de Operações',
        periodLabel,
        sections: [
          {
            heading: 'Tarefas do período',
            columns: ['Prazo', 'Tarefa', 'Equipe', 'Status', 'Entrega', 'Motivo do atraso'],
            rows: tasks.map((t) => [
              D(t.dueDate),
              t.title,
              t.team?.name ?? '—',
              t.status,
              t.deliveredDate ? D(t.deliveredDate) : '—',
              t.delayReason ?? '—',
            ]),
          },
        ],
      };
    }
    default:
      throw new Error(`Aba de relatório desconhecida: ${tab}`);
  }
}

export async function toExcel(report: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  ws.addRow([report.title]).font = { bold: true, size: 14 };
  ws.addRow([`Período: ${report.periodLabel}`]).font = { size: 10, color: { argb: 'FF888888' } };
  ws.addRow([]);
  for (const section of report.sections) {
    ws.addRow([section.heading]).font = { bold: true, size: 12 };
    const header = ws.addRow(section.columns);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1F2B' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });
    for (const row of section.rows) ws.addRow(row);
    ws.addRow([]);
  }
  ws.columns.forEach((col) => {
    let max = 12;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      max = Math.max(max, String(cell.value ?? '').length + 2);
    });
    col.width = Math.min(max, 48);
  });
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function toPdf(report: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).font('Helvetica-Bold').text(report.title);
    doc.fontSize(9).font('Helvetica').fillColor('#666666').text(`Período: ${report.periodLabel}`);
    doc.moveDown(1);

    const pageWidth = doc.page.width - 80;
    for (const section of report.sections) {
      doc.fillColor('#000000').fontSize(12).font('Helvetica-Bold').text(section.heading);
      doc.moveDown(0.4);
      const colWidth = pageWidth / section.columns.length;

      const drawRow = (cells: (string | number)[], bold = false) => {
        if (doc.y > doc.page.height - 70) doc.addPage();
        const y = doc.y;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(bold ? '#000000' : '#222222');
        cells.forEach((cell, i) => {
          doc.text(String(cell), 40 + i * colWidth, y, {
            width: colWidth - 6,
            lineBreak: false,
            ellipsis: true,
          });
        });
        doc.y = y + 14;
        doc.x = 40;
      };

      drawRow(section.columns, true);
      doc
        .moveTo(40, doc.y - 3)
        .lineTo(40 + pageWidth, doc.y - 3)
        .strokeColor('#999999')
        .lineWidth(0.5)
        .stroke();
      for (const row of section.rows) drawRow(row);
      if (section.rows.length === 0) {
        doc.font('Helvetica').fontSize(8).fillColor('#888888').text('Sem registros no período.');
        doc.moveDown(0.5);
      }
      doc.moveDown(1);
    }
    doc.end();
  });
}
