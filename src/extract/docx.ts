// Leitura de orçamentos em Word (.docx): tabelas do word/document.xml → Grids.
import { DOMParser, type Document as XmlDocument, type Element as XmlElement } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { parseNumeroBR } from '../domain/numbers';
import type { Cell, Documento, Grid } from '../domain/types';

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export const filhos = (el: XmlElement, nome: string): XmlElement[] =>
  Array.from(el.childNodes as unknown as ArrayLike<XmlElement>).filter((n) => n.nodeType === 1 && n.nodeName === nome);

export function descendentes(el: XmlElement | XmlDocument, nome: string): XmlElement[] {
  return Array.from(el.getElementsByTagName(nome) as unknown as ArrayLike<XmlElement>);
}

/** Tabelas de primeiro nível (não aninhadas em outra tabela), na ordem do documento. */
export function tabelasDoCorpo(doc: XmlDocument): XmlElement[] {
  return descendentes(doc, 'w:tbl').filter((t) => {
    for (let p = t.parentNode as XmlElement | null; p; p = p.parentNode as XmlElement | null) {
      if (p.nodeName === 'w:tbl') return false;
    }
    return true;
  });
}

/** Texto de um parágrafo (w:t, tabulações e quebras viram espaço). */
export function textoParagrafo(p: XmlElement): string {
  let s = '';
  const visitar = (n: XmlElement) => {
    for (const c of Array.from(n.childNodes as unknown as ArrayLike<XmlElement>)) {
      if (c.nodeType !== 1) continue;
      if (c.nodeName === 'w:t') s += c.textContent ?? '';
      else if (c.nodeName === 'w:tab' || c.nodeName === 'w:br' || c.nodeName === 'w:cr') s += ' ';
      else if (c.nodeName !== 'w:tbl' && c.nodeName !== 'w:pPr' && c.nodeName !== 'w:rPr') visitar(c);
    }
  };
  visitar(p);
  return s;
}

export function textoCelula(tc: XmlElement): string {
  return filhos(tc, 'w:p').map(textoParagrafo).join(' ').replace(/\s+/g, ' ').trim();
}

function propriedade(tc: XmlElement, nome: string): XmlElement | undefined {
  const pr = filhos(tc, 'w:tcPr')[0];
  return pr ? filhos(pr, nome)[0] : undefined;
}

export function tabelaParaGrid(tbl: XmlElement, indice: number): Grid {
  const rows: Cell[][] = [];
  filhos(tbl, 'w:tr').forEach((tr, r) => {
    const linha: Cell[] = [];
    filhos(tr, 'w:tc').forEach((tc, c) => {
      const span = Number(propriedade(tc, 'w:gridSpan')?.getAttribute('w:val') ?? 1) || 1;
      const vMerge = propriedade(tc, 'w:vMerge');
      const continua = vMerge && (vMerge.getAttribute('w:val') ?? 'continue') !== 'restart';
      const text = continua ? '' : textoCelula(tc);
      linha.push({ text, num: parseNumeroBR(text), loc: { kind: 'docx', table: indice, row: r, cell: c } });
      for (let k = 1; k < span; k++) linha.push({ text: '' });
    });
    rows.push(linha);
  });
  const nCols = Math.max(0, ...rows.map((r) => r.length));
  return { name: `Tabela ${indice + 1} (${rows.length} linhas × ${nCols} colunas)`, rows, source: 'docx' };
}

export async function abrirDocx(bytes: ArrayBuffer): Promise<{ zip: JSZip; doc: XmlDocument }> {
  const zip = await JSZip.loadAsync(bytes);
  const arquivo = zip.file('word/document.xml');
  if (!arquivo) throw new Error('Arquivo .docx inválido (word/document.xml não encontrado).');
  const xml = await arquivo.async('string');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return { zip, doc };
}

export async function lerDocx(nome: string, bytes: ArrayBuffer): Promise<Documento> {
  const { doc } = await abrirDocx(bytes);
  const grids = tabelasDoCorpo(doc).map(tabelaParaGrid);
  const fullText = descendentes(doc, 'w:p').map(textoParagrafo).filter((t) => t.trim()).join('\n');
  return { arquivo: nome, source: 'docx', grids, fullText, ocr: false, bytes };
}
