// Word corrigido (design.md §7): cópia do .docx com texto trocado, sombreamento e comentários nativos.
import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from '@xmldom/xmldom';
import { formatNum } from '../domain/numbers';
import { TIPO_DIV_LABEL, type Campo, type Correcao, type Resultado } from '../domain/types';
import { abrirDocx, descendentes, filhos, tabelasDoCorpo, W_NS } from '../extract/docx';
import { agruparPorCelula, CORES, descreverLoc, formatarValor, linhasResumo, MARCA_LABEL, textoComentario } from './common';

const REL_COMMENTS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments';
const CT_COMMENTS = 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

/** Ordem dos filhos de w:tcPr exigida pelo schema do Word (w:shd vem antes destes). */
const DEPOIS_DE_SHD = ['w:noWrap', 'w:tcMar', 'w:textDirection', 'w:tcFitText', 'w:vAlign', 'w:hideMark', 'w:headers', 'w:cellIns', 'w:cellDel', 'w:cellMerge', 'w:tcPrChange'];

const CAMPOS_DINHEIRO: Campo[] = ['precoUnit', 'precoUnitBdi', 'total'];

function el(doc: XmlDocument, nome: string, attrs: Record<string, string> = {}, ...filhosEl: XmlElement[]): XmlElement {
  const e = doc.createElementNS(W_NS, nome);
  for (const [k, v] of Object.entries(attrs)) e.setAttributeNS(W_NS, k, v);
  for (const f of filhosEl) e.appendChild(f);
  return e;
}

function run(doc: XmlDocument, texto: string, negrito = false): XmlElement {
  const t = el(doc, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.appendChild(doc.createTextNode(texto));
  const r = el(doc, 'w:r');
  if (negrito) r.appendChild(el(doc, 'w:rPr', {}, el(doc, 'w:b')));
  r.appendChild(t);
  return r;
}

function paragrafo(doc: XmlDocument, texto: string, negrito = false): XmlElement {
  return el(doc, 'w:p', {}, run(doc, texto, negrito));
}

/** Formata o valor corrigido no mesmo estilo do texto original ("R$ 1.234,56" ou "1.234,56"). */
function textoCorrigido(campo: Campo | undefined, original: string, v: string | number): string {
  if (typeof v !== 'number') return v;
  if (campo && CAMPOS_DINHEIRO.includes(campo)) {
    const s = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return /R\$/.test(original) ? `R$ ${s}` : s;
  }
  const casas = (original.split(',')[1] ?? '').replace(/\D/g, '').length;
  return casas ? v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) : formatNum(v);
}

function trocarTexto(doc: XmlDocument, tc: XmlElement, texto: string) {
  const ts = descendentes(tc, 'w:t');
  if (ts.length === 0) {
    let p = filhos(tc, 'w:p')[0];
    if (!p) {
      p = el(doc, 'w:p');
      tc.appendChild(p);
    }
    p.appendChild(run(doc, texto));
    return;
  }
  ts.forEach((t, i) => {
    while (t.firstChild) t.removeChild(t.firstChild);
    if (i === 0) {
      t.appendChild(doc.createTextNode(texto));
      t.setAttribute('xml:space', 'preserve');
    }
  });
}

function sombrear(doc: XmlDocument, tc: XmlElement, hex: string) {
  let pr = filhos(tc, 'w:tcPr')[0];
  if (!pr) {
    pr = el(doc, 'w:tcPr');
    tc.insertBefore(pr, tc.firstChild);
  }
  for (const s of filhos(pr, 'w:shd')) pr.removeChild(s);
  const shd = el(doc, 'w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': hex });
  const ref = Array.from(pr.childNodes as unknown as ArrayLike<XmlElement>).find((n) => n.nodeType === 1 && DEPOIS_DE_SHD.includes(n.nodeName));
  if (ref) pr.insertBefore(shd, ref);
  else pr.appendChild(shd);
}

interface Comentarios {
  doc: XmlDocument;
  proximoId: number;
}

function ancorarComentario(doc: XmlDocument, tc: XmlElement, id: number) {
  let p = filhos(tc, 'w:p')[0];
  if (!p) {
    p = el(doc, 'w:p');
    tc.appendChild(p);
  }
  const ppr = filhos(p, 'w:pPr')[0];
  const inicio = el(doc, 'w:commentRangeStart', { 'w:id': String(id) });
  if (ppr) p.insertBefore(inicio, ppr.nextSibling);
  else p.insertBefore(inicio, p.firstChild);
  p.appendChild(el(doc, 'w:commentRangeEnd', { 'w:id': String(id) }));
  p.appendChild(el(doc, 'w:r', {}, el(doc, 'w:commentReference', { 'w:id': String(id) })));
}

function novoComentario(c: Comentarios, texto: string): number {
  const id = c.proximoId++;
  const com = el(c.doc, 'w:comment', {
    'w:id': String(id), 'w:author': 'Verificador SINAPI-BA', 'w:initials': 'VS', 'w:date': new Date().toISOString().slice(0, 19) + 'Z',
  });
  for (const linha of texto.split('\n')) com.appendChild(paragrafo(c.doc, linha));
  c.doc.documentElement!.appendChild(com);
  return id;
}

function tabelaResumo(doc: XmlDocument, r: Resultado): XmlElement[] {
  const borda = (n: string) => el(doc, n, { 'w:val': 'single', 'w:sz': '4', 'w:space': '0', 'w:color': '999999' });
  const cabecalho = ['Local', 'Situação', 'Tipo', 'Original', 'Corrigido', 'Motivo'];
  const larguras = [1300, 1200, 1700, 1500, 1500, 3800];
  const celula = (texto: string, w: number, fill?: string, negrito = false) => {
    const pr = el(doc, 'w:tcPr', {}, el(doc, 'w:tcW', { 'w:w': String(w), 'w:type': 'dxa' }));
    if (fill) pr.appendChild(el(doc, 'w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': fill }));
    return el(doc, 'w:tc', {}, pr, paragrafo(doc, texto, negrito));
  };
  const tbl = el(
    doc, 'w:tbl', {},
    el(doc, 'w:tblPr', {},
      el(doc, 'w:tblW', { 'w:w': '0', 'w:type': 'auto' }),
      el(doc, 'w:tblBorders', {}, borda('w:top'), borda('w:left'), borda('w:bottom'), borda('w:right'), borda('w:insideH'), borda('w:insideV'))),
    el(doc, 'w:tblGrid', {}, ...larguras.map((w) => el(doc, 'w:gridCol', { 'w:w': String(w) }))),
    el(doc, 'w:tr', {}, ...cabecalho.map((t, i) => celula(t, larguras[i], 'E5E7EB', true))),
  );
  for (const c of r.correcoes) {
    const valores = c.marca === 'corrigido' || c.marca === 'recalculado';
    tbl.appendChild(el(doc, 'w:tr', {},
      celula(c.linha < 0 ? 'Geral' : descreverLoc(c.loc), larguras[0]),
      celula(MARCA_LABEL[c.marca], larguras[1], CORES[c.marca].hex),
      celula(TIPO_DIV_LABEL[c.tipo], larguras[2]),
      celula(formatarValor(c.campo, c.original), larguras[3]),
      celula(valores ? formatarValor(c.campo, c.corrigido) : '', larguras[4]),
      celula(c.motivo, larguras[5])));
  }
  const titulo = paragrafo(doc, 'Correções — Verificador SINAPI-BA', true);
  const resumo = linhasResumo(r).map(([k, v]) => paragrafo(doc, `${k}: ${v}`));
  const quebra = el(doc, 'w:p', {}, el(doc, 'w:r', {}, el(doc, 'w:br', { 'w:type': 'page' })));
  return [quebra, titulo, ...resumo, paragrafo(doc, ''), tbl, paragrafo(doc, '')];
}

export async function gerarDocxCorrigido(bytes: ArrayBuffer, r: Resultado): Promise<Uint8Array> {
  const { zip, doc } = await abrirDocx(bytes);
  const parser = new DOMParser();
  const serial = new XMLSerializer();

  // comments.xml (cria se não existir)
  const caminhoComentarios = 'word/comments.xml';
  const existente = zip.file(caminhoComentarios);
  const docComentarios = existente
    ? parser.parseFromString(await existente.async('string'), 'text/xml')
    : parser.parseFromString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W_NS}"/>`, 'text/xml');
  const idsExistentes = descendentes(docComentarios, 'w:comment').map((c) => Number(c.getAttribute('w:id')) || 0);
  const comentarios: Comentarios = { doc: docComentarios, proximoId: idsExistentes.length ? Math.max(...idsExistentes) + 1 : 0 };

  const tabelas = tabelasDoCorpo(doc);
  const grupos = agruparPorCelula(r.correcoes, (c) => (c.loc?.kind === 'docx' ? `${c.loc.table}:${c.loc.row}:${c.loc.cell}` : undefined));
  for (const [, g] of grupos) {
    const loc = g.itens[0].loc as Extract<Correcao['loc'], { kind: 'docx' }>;
    const tr = filhos(tabelas[loc.table], 'w:tr')[loc.row];
    const tc = tr ? filhos(tr, 'w:tc')[loc.cell] : undefined;
    if (!tc) continue;
    const comValor = g.itens.filter((c) => (c.marca === 'corrigido' || c.marca === 'recalculado') && c.corrigido !== undefined);
    const ultimo = comValor[comValor.length - 1];
    if (ultimo) {
      const original = descendentes(tc, 'w:t').map((t) => t.textContent ?? '').join('');
      trocarTexto(doc, tc, textoCorrigido(ultimo.campo, original, ultimo.corrigido!));
    }
    sombrear(doc, tc, CORES[g.marca].hex);
    const id = novoComentario(comentarios, g.itens.map((c) => textoComentario(r, c)).join('\n'));
    ancorarComentario(doc, tc, id);
  }

  // resumo ao final do documento (antes do w:sectPr)
  const body = descendentes(doc, 'w:body')[0];
  const sect = filhos(body, 'w:sectPr')[0];
  for (const n of tabelaResumo(doc, r)) body.insertBefore(n, sect ?? null);

  zip.file('word/document.xml', serial.serializeToString(doc));
  zip.file(caminhoComentarios, serial.serializeToString(docComentarios));

  if (!existente) {
    const relPath = 'word/_rels/document.xml.rels';
    const relXml = (await zip.file(relPath)?.async('string')) ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"/>`;
    const rels = parser.parseFromString(relXml, 'text/xml');
    const ids = Array.from(rels.getElementsByTagName('Relationship') as unknown as ArrayLike<XmlElement>).map((e) => e.getAttribute('Id') ?? '');
    let n = ids.length + 1;
    while (ids.includes(`rId${n}`)) n++;
    const rel = rels.createElementNS(REL_NS, 'Relationship');
    rel.setAttribute('Id', `rId${n}`);
    rel.setAttribute('Type', REL_COMMENTS);
    rel.setAttribute('Target', 'comments.xml');
    rels.documentElement!.appendChild(rel);
    zip.file(relPath, serial.serializeToString(rels));

    const ctFile = zip.file('[Content_Types].xml');
    if (!ctFile) throw new Error('Arquivo .docx inválido ([Content_Types].xml ausente).');
    const ct = parser.parseFromString(await ctFile.async('string'), 'text/xml');
    const jaTem = Array.from(ct.getElementsByTagName('Override') as unknown as ArrayLike<XmlElement>).some((o) => o.getAttribute('PartName') === '/word/comments.xml');
    if (!jaTem) {
      const ov = ct.createElementNS(CT_NS, 'Override');
      ov.setAttribute('PartName', '/word/comments.xml');
      ov.setAttribute('ContentType', CT_COMMENTS);
      ct.documentElement!.appendChild(ov);
      zip.file('[Content_Types].xml', serial.serializeToString(ct));
    }
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
