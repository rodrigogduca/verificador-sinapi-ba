// Relatório de divergências em Excel e PDF (R8.4).
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { CAMPO_LABEL, TIPO_DIV_LABEL, type Correcao, type Resultado } from '../domain/types';
import { CORES, descreverLoc, formatarValor, linhasResumo, MARCA_LABEL } from './common';

const fill = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } });

function itemDaLinha(r: Resultado, c: Correcao): string {
  const l = r.linhas.find((x) => x.linha.idx === c.linha);
  return l?.linha.valores.itemNum ?? l?.linha.valores.codigo ?? '';
}

export async function gerarRelatorioExcel(r: Resultado): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Resumo');
  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 60;
  ws.addRow(['Relatório de verificação SINAPI-BA']).font = { bold: true, size: 14 };
  for (const [k, v] of linhasResumo(r)) ws.addRow([k, v]).getCell(1).font = { bold: true };

  const wd = wb.addWorksheet('Divergências');
  const cols = [['Local', 18], ['Linha', 8], ['Item/Código', 14], ['Situação', 16], ['Tipo', 32], ['Campo', 18], ['Valor original', 22], ['Valor corrigido', 22], ['Motivo', 90]] as const;
  cols.forEach(([, w], i) => (wd.getColumn(i + 1).width = w));
  const h = wd.addRow(cols.map(([n]) => n));
  h.font = { bold: true };
  h.eachCell((c) => (c.style = { ...c.style, fill: fill('E5E7EB') }));
  for (const c of r.correcoes) {
    const row = wd.addRow([
      c.linha < 0 ? 'Geral' : descreverLoc(c.loc),
      c.linha < 0 ? '' : c.linha + 1,
      itemDaLinha(r, c),
      MARCA_LABEL[c.marca],
      TIPO_DIV_LABEL[c.tipo],
      c.campo ? CAMPO_LABEL[c.campo] : '',
      formatarValor(c.campo, c.original),
      formatarValor(c.campo, c.corrigido),
      c.motivo,
    ]);
    row.getCell(4).style = { ...row.getCell(4).style, fill: fill(CORES[c.marca].hex) };
    row.getCell(9).alignment = { wrapText: true, vertical: 'top' };
  }
  wd.autoFilter = { from: 'A1', to: 'I1' };
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** jsPDF usa fontes padrão (WinAnsi): troca caracteres fora dessa codificação. */
const pdfTxt = (s: string) => s.replace(/[–—]/g, '-').replace(/→/g, '->').replace(/[“”]/g, '"').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');

export async function gerarRelatorioPdf(r: Resultado): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(pdfTxt('Relatório de verificação SINAPI-BA'), 40, 40);
  autoTable(doc, {
    startY: 55,
    body: linhasResumo(r).map(([k, v]) => [pdfTxt(k), pdfTxt(v)]),
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 200 } },
  });
  const rgb = (m: Correcao['marca']) => CORES[m].rgb.map((x) => Math.round(x * 255)) as [number, number, number];
  autoTable(doc, {
    head: [['Local', 'Item', 'Situação', 'Tipo', 'Original', 'Corrigido', 'Motivo']],
    body: r.correcoes.map((c) => [
      pdfTxt(c.linha < 0 ? 'Geral' : descreverLoc(c.loc)),
      pdfTxt(itemDaLinha(r, c)),
      pdfTxt(MARCA_LABEL[c.marca]),
      pdfTxt(TIPO_DIV_LABEL[c.tipo]),
      pdfTxt(formatarValor(c.campo, c.original)).slice(0, 120),
      pdfTxt(formatarValor(c.campo, c.corrigido)).slice(0, 120),
      pdfTxt(c.motivo),
    ]),
    styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [55, 65, 81] },
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 45 }, 2: { cellWidth: 60 }, 3: { cellWidth: 95 }, 4: { cellWidth: 110 }, 5: { cellWidth: 110 } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 2) d.cell.styles.fillColor = rgb(r.correcoes[d.row.index].marca);
    },
  });
  return new Uint8Array(doc.output('arraybuffer'));
}
