// Excel corrigido (design.md §7): cópia do arquivo original com valores corrigidos, cores e notas.
import ExcelJS from 'exceljs';
import { CAMPOS, CAMPO_LABEL, TIPO_DIV_LABEL, TIPO_LINHA_LABEL, type Correcao, type Resultado } from '../domain/types';
import {
  agruparPorCelula, CORES, descreverLoc, formatarValor, linhasResumo, MARCA_LABEL, textoComentario,
} from './common';

const fill = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } });

/** ExcelJS compartilha objetos de estilo entre células: clona antes de pintar. */
function pintar(cell: ExcelJS.Cell, hex: string) {
  cell.style = { ...cell.style, fill: fill(hex) };
}

/** Converte fórmulas compartilhadas em fórmulas normais, para poder alterar qualquer célula com segurança. */
function desfazerFormulasCompartilhadas(ws: ExcelJS.Worksheet) {
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value as Record<string, unknown> | null;
      if (v && typeof v === 'object' && ('sharedFormula' in v || v.shareType === 'shared')) {
        cell.value = { formula: cell.formula, result: v.result as number } as ExcelJS.CellFormulaValue;
      }
    });
  });
}

function adicionarNota(cell: ExcelJS.Cell, texto: string) {
  const atual = cell.note;
  const anterior = typeof atual === 'string' ? atual : atual?.texts?.map((t) => t.text).join('') ?? '';
  const nota = anterior ? `${anterior}\n\n${texto}` : texto;
  cell.note = { texts: [{ text: nota }], margins: { insetmode: 'auto' } } as ExcelJS.Comment;
}

function adicionarAbaCorrecoes(wb: ExcelJS.Workbook, r: Resultado) {
  let nome = 'Correções SINAPI';
  for (let i = 2; wb.getWorksheet(nome); i++) nome = `Correções SINAPI ${i}`;
  const ws = wb.addWorksheet(nome);
  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 30;
  ws.getColumn(6).width = 16;
  ws.getColumn(7).width = 22;
  ws.getColumn(8).width = 22;
  ws.getColumn(9).width = 90;

  ws.addRow(['Verificação SINAPI-BA — resumo']).font = { bold: true, size: 14 };
  for (const [k, v] of linhasResumo(r)) {
    const row = ws.addRow([k, v]);
    row.getCell(1).font = { bold: true };
  }
  ws.addRow([]);
  ws.addRow(['Legenda']).font = { bold: true };
  for (const m of ['corrigido', 'recalculado', 'revisao', 'aviso'] as const) {
    const row = ws.addRow([CORES[m].nome]);
    pintar(row.getCell(1), CORES[m].hex);
  }
  ws.addRow([]);
  const header = ws.addRow(['Local', 'Situação', 'Linha', 'Item', 'Tipo', 'Campo', 'Valor original', 'Valor corrigido', 'Motivo']);
  header.font = { bold: true };
  header.eachCell((c) => (pintar(c, 'E5E7EB')));

  const porLinha = new Map(r.linhas.map((l) => [l.linha.idx, l]));
  for (const c of r.correcoes) {
    const l = porLinha.get(c.linha);
    const row = ws.addRow([
      c.linha < 0 ? 'Geral' : descreverLoc(c.loc),
      MARCA_LABEL[c.marca],
      c.linha < 0 ? '' : c.linha + 1,
      l?.linha.valores.itemNum ?? l?.linha.valores.codigo ?? '',
      TIPO_DIV_LABEL[c.tipo],
      c.campo ? CAMPO_LABEL[c.campo] : '',
      formatarValor(c.campo, c.original),
      formatarValor(c.campo, c.corrigido),
      c.motivo,
    ]);
    pintar(row.getCell(2), CORES[c.marca].hex);
    row.getCell(9).alignment = { wrapText: true, vertical: 'top' };
  }
  ws.views = [{ state: 'normal' }];
}

/** Gera o .xlsx corrigido a partir dos bytes do .xlsx original (ou convertido de .xls). */
export async function gerarExcelCorrigido(bytesXlsx: ArrayBuffer, r: Resultado): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytesXlsx);
  const sheets = new Set<string>();
  for (const c of r.correcoes) if (c.loc?.kind === 'xlsx') sheets.add(c.loc.sheet);
  for (const s of sheets) {
    const ws = wb.getWorksheet(s);
    if (ws) desfazerFormulasCompartilhadas(ws);
  }

  const grupos = agruparPorCelula(r.correcoes, (c) => (c.loc?.kind === 'xlsx' ? `${c.loc.sheet}!${c.loc.address}` : undefined));
  for (const [, g] of grupos) {
    const loc = g.itens[0].loc as Extract<Correcao['loc'], { kind: 'xlsx' }>;
    const ws = wb.getWorksheet(loc.sheet);
    if (!ws) continue;
    const cell = ws.getCell(loc.address);
    const comValor = g.itens.filter((c) => (c.marca === 'corrigido' || c.marca === 'recalculado') && c.corrigido !== undefined);
    const ultimo = comValor[comValor.length - 1];
    if (ultimo) {
      const formula = cell.formula;
      if (formula && ultimo.marca === 'recalculado') {
        // fórmula continua válida: mantém e atualiza o resultado em cache
        cell.value = { formula, result: ultimo.corrigido } as ExcelJS.CellFormulaValue;
      } else {
        cell.value = ultimo.corrigido as ExcelJS.CellValue;
        if (formula) adicionarNota(cell, `Fórmula original substituída pelo valor corrigido: =${formula}`);
      }
    }
    pintar(cell, CORES[g.marca].hex);
    for (const c of g.itens) adicionarNota(cell, textoComentario(r, c));
  }

  adicionarAbaCorrecoes(wb, r);
  wb.calcProperties = { ...(wb.calcProperties ?? {}), fullCalcOnLoad: true };
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** Excel corrigido montado a partir da tabela extraída (para PDF, imagem e como alternativa geral). */
export async function gerarExcelDeTabela(r: Resultado): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Orçamento corrigido');
  const campos = CAMPOS.filter((c) => r.mapeamento.colunas[c] !== undefined);
  ws.addRow(['Linha', 'Tipo', ...campos.map((c) => CAMPO_LABEL[c])]).font = { bold: true };
  ws.getRow(1).eachCell((c) => (pintar(c, 'E5E7EB')));
  campos.forEach((c, i) => (ws.getColumn(i + 3).width = c === 'descricao' ? 60 : 16));

  for (const rl of r.linhas) {
    if (rl.linha.tipo === 'ignorar') continue;
    const row = ws.addRow([
      rl.linha.idx + 1,
      TIPO_LINHA_LABEL[rl.linha.tipo],
      ...campos.map((c) => (rl.final[c === 'item' ? 'itemNum' : c] ?? '') as string | number),
    ]);
    const grupos = agruparPorCelula(rl.correcoes, (c) => c.campo);
    for (const [campo, g] of grupos) {
      const i = campos.indexOf(campo);
      const cell = row.getCell(i >= 0 ? i + 3 : 2);
      pintar(cell, CORES[g.marca].hex);
      for (const c of g.itens) adicionarNota(cell, textoComentario(r, c));
    }
    for (const c of rl.correcoes.filter((x) => !x.campo)) {
      pintar(row.getCell(2), CORES[c.marca].hex);
      adicionarNota(row.getCell(2), textoComentario(r, c));
    }
    campos.forEach((c, i) => {
      if (c === 'precoUnit' || c === 'precoUnitBdi' || c === 'total') row.getCell(i + 3).numFmt = '#,##0.00';
    });
  }
  adicionarAbaCorrecoes(wb, r);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
