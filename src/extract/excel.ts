// Leitura de orçamentos em Excel (.xlsx via ExcelJS; .xls convertido com SheetJS).
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { parseNumeroBR } from '../domain/numbers';
import type { Cell, Documento, Grid } from '../domain/types';

/** .xls (BIFF) → bytes .xlsx, para seguir sempre pelo mesmo caminho (ExcelJS). */
export function xlsParaXlsx(bytes: ArrayBuffer): ArrayBuffer {
  const wb = XLSX.read(bytes, { type: 'array', cellStyles: true, cellFormula: true, cellNF: true });
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

export const ehXlsxZip = (bytes: ArrayBuffer) => {
  const b = new Uint8Array(bytes, 0, 4);
  return b[0] === 0x50 && b[1] === 0x4b; // "PK"
};

const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6, useGrouping: false });

function textoNumero(v: number, numFmt?: string): string {
  if (numFmt && numFmt.includes('%')) return `${fmtNum.format(v * 100)}%`;
  return fmtNum.format(v);
}

/** Extrai texto, número e fórmula de uma célula ExcelJS. */
export function lerCelula(cell: ExcelJS.Cell): Omit<Cell, 'loc'> {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return { text: '' };
  if (typeof v === 'number') return { text: textoNumero(v, cell.numFmt), num: v };
  if (typeof v === 'string') return { text: v.trim(), num: parseNumeroBR(v) };
  if (typeof v === 'boolean') return { text: v ? 'VERDADEIRO' : 'FALSO' };
  if (v instanceof Date) return { text: v.toISOString().slice(0, 10) };
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('formula' in o || 'sharedFormula' in o) {
      const formula = cell.formula;
      const r = o.result as unknown;
      if (typeof r === 'number') return { text: textoNumero(r, cell.numFmt), num: r, formula };
      if (typeof r === 'string') return { text: r.trim(), num: parseNumeroBR(r), formula };
      if (r instanceof Date) return { text: r.toISOString().slice(0, 10), formula };
      return { text: '', formula };
    }
    if ('richText' in o && Array.isArray(o.richText)) {
      const t = (o.richText as { text: string }[]).map((p) => p.text).join('').trim();
      return { text: t, num: parseNumeroBR(t) };
    }
    if ('text' in o) {
      const t = String(o.text).trim();
      return { text: t, num: parseNumeroBR(t) };
    }
    if ('error' in o) return { text: String(o.error) };
  }
  return { text: String(v) };
}

export async function carregarWorkbook(bytes: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  return wb;
}

export function planilhaParaGrid(ws: ExcelJS.Worksheet): Grid {
  const rows: Cell[][] = [];
  const nRows = ws.rowCount;
  const nCols = ws.columnCount;
  for (let r = 1; r <= nRows; r++) {
    const linha: Cell[] = [];
    for (let c = 1; c <= nCols; c++) {
      const cell = ws.getCell(r, c);
      const loc = { kind: 'xlsx' as const, sheet: ws.name, address: cell.address, row: r, col: c };
      if (cell.isMerged && cell.master.address !== cell.address) {
        linha.push({ text: '', loc });
        continue;
      }
      linha.push({ ...lerCelula(cell), loc });
    }
    rows.push(linha);
  }
  return { name: ws.name, rows, source: 'xlsx' };
}

export async function lerExcel(arquivo: string, original: ArrayBuffer): Promise<Documento> {
  const bytes = ehXlsxZip(original) ? original : xlsParaXlsx(original);
  const wb = await carregarWorkbook(bytes);
  const grids = wb.worksheets.filter((ws) => ws.state !== 'hidden' && ws.state !== 'veryHidden').map(planilhaParaGrid);
  const fullText = grids
    .map((g) => g.rows.slice(0, 400).map((r) => r.map((c) => c.text).filter(Boolean).join(' ')).join('\n'))
    .join('\n');
  return { arquivo, source: 'xlsx', grids, fullText, ocr: false, bytes };
}
