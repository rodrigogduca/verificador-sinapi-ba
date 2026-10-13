// Orçamento em PDF com texto (mesmos dados do Excel). VALORES FICTÍCIOS.
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { calcularLinha, ORCAMENTO, TOTAL_ETAPA3_ERRADO } from './generate';

const r2 = (v: number) => Math.round(v * 100 + 1e-7) / 100;
const brNum = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const toAB = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

function quebrarTexto(t: string, font: PDFFont, size: number, largura: number): string[] {
  const out: string[] = [];
  let atual = '';
  for (const w of t.split(' ')) {
    const tent = atual ? `${atual} ${w}` : w;
    if (font.widthOfTextAtSize(tent, size) > largura && atual) {
      out.push(atual);
      atual = w;
    } else atual = tent;
  }
  if (atual) out.push(atual);
  return out;
}

/** Totais das etapas como aparecem no documento (etapa 3 errada de propósito). */
export function totaisEtapas(): { etapas: number[]; geral: number } {
  const etapas: number[] = [];
  let atual = -1;
  for (const l of ORCAMENTO) {
    if (l.titulo) {
      etapas.push(0);
      atual++;
    } else etapas[atual] = r2(etapas[atual] + calcularLinha(l).total);
  }
  etapas[2] = TOTAL_ETAPA3_ERRADO;
  return { etapas, geral: r2(etapas.reduce((a, b) => a + b, 0)) };
}

export interface OpcoesPdf {
  /** força quebra de página depois desta quantidade de linhas de dados */
  linhasPorPagina?: number;
  fonte?: number;
}

/** Desenha o orçamento como PDF vetorial (texto selecionável). */
export async function orcamentoPdf(op: OpcoesPdf = {}): Promise<ArrayBuffer> {
  const size = op.fonte ?? 7;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const col = {
    item: { x: 28, w: 26, dir: false },
    codigo: { x: 56, w: 34, dir: false },
    fonte: { x: 92, w: 36, dir: false },
    descricao: { x: 130, w: 205, dir: false },
    und: { x: 340, w: 20, dir: false },
    qtd: { x: 362, w: 40, dir: true },
    pu: { x: 404, w: 46, dir: true },
    pub: { x: 452, w: 60, dir: true },
    total: { x: 514, w: 54, dir: true },
  };
  const cab: [keyof typeof col, string][] = [
    ['item', 'Item'], ['codigo', 'Código'], ['fonte', 'Fonte'], ['descricao', 'Descrição'], ['und', 'Und'],
    ['qtd', 'Quant.'], ['pu', 'P. Unit.'], ['pub', 'P. Unit. c/ BDI'], ['total', 'Total'],
  ];
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - 40;
  const txt = (c: keyof typeof col, t: string, f: PDFFont = font) => {
    const k = col[c];
    const x = k.dir ? k.x + k.w - f.widthOfTextAtSize(t, size) : k.x;
    page.drawText(t, { x, y, size, font: f });
  };
  const cabecalho = () => {
    for (const [c, t] of cab) txt(c, t, bold);
    y -= size + 6;
  };
  page.drawText('PREFEITURA MUNICIPAL DE EXEMPLO', { x: 28, y, size: 11, font: bold });
  y -= 16;
  page.drawText('Obra: Reforma da Escola Municipal', { x: 28, y, size: 9, font });
  y -= 12;
  page.drawText('Referência: SINAPI-BA 08/2026 - Não desonerado    BDI: 25,00%', { x: 28, y, size: 9, font });
  y -= 22;
  cabecalho();

  const { etapas, geral } = totaisEtapas();
  let etapa = -1;
  let linhasNaPagina = 0;
  for (const l of ORCAMENTO) {
    if (op.linhasPorPagina && linhasNaPagina >= op.linhasPorPagina) {
      page = doc.addPage([W, H]);
      y = H - 40;
      cabecalho();
      linhasNaPagina = 0;
    }
    if (l.titulo) {
      etapa++;
      y -= 3;
      txt('item', l.item, bold);
      txt('descricao', l.descricao, bold);
      txt('total', brNum(etapas[etapa]), bold);
      y -= size + 5;
    } else {
      const { pub, total } = calcularLinha(l);
      const linhasDesc = quebrarTexto(l.descricao, font, size, col.descricao.w);
      txt('item', l.item);
      txt('codigo', l.codigo ?? '');
      txt('fonte', l.fonte ?? '');
      txt('descricao', linhasDesc[0]);
      txt('und', l.und ?? '');
      txt('qtd', brNum(l.qtd!));
      txt('pu', brNum(l.pu!));
      txt('pub', brNum(pub));
      txt('total', brNum(total));
      for (const extra of linhasDesc.slice(1)) {
        y -= size + 2;
        txt('descricao', extra);
      }
      y -= size + 5;
    }
    linhasNaPagina++;
  }
  y -= 4;
  txt('descricao', 'TOTAL GERAL', bold);
  txt('total', brNum(geral), bold);
  y -= 30;
  page.drawText('Responsável técnico: Eng. Fulano de Tal - CREA 0000', { x: 28, y, size: 8, font });
  return toAB(await doc.save());
}
