// Parser CSV simples para a importação genérica de planilhas (Domínio).
// Sem dependência externa: formatos de CSV exportados por ERPs contábeis
// costumam ser regulares (sem quebras de linha dentro de campos).

/** Detecta separador (',' ou ';') pela primeira linha e parseia todas as linhas. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  return lines.map((line) => splitCsvLine(line, sep));
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === sep && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
