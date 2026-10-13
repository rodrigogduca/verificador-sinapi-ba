// PDF anotado (design.md §7): marcações coloridas e numeradas sobre o original + lista de correções ao final.
import { PDFDocument, PDFHexString, PDFName, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { CAMPO_LABEL, TIPO_DIV_LABEL, type Correcao, type Resultado } from '../domain/types';
import { agruparPorCelula, CORES, formatarValor, linhasResumo, MARCA_LABEL, textoComentario } from './common';

/** Substitui caracteres que a fonte padrão (WinAnsi) não codifica. */
function sanitizador(font: PDFFont) {
  const cache = new Map<string, string>();
  const troca: Record<string, string> = { '→': '->', '–': '-', '—': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...' };
  return (s: string) =>
    Array.from(s)
      .map((ch) => {
        if (cache.has(ch)) return cache.get(ch)!;
        let out = troca[ch] ?? ch;
        try {
          font.encodeText(out);
        } catch {
          out = '?';
        }
        cache.set(ch, out);
        return out;
      })
      .join('');
}

function quebrar(texto: string, font: PDFFont, size: number, largura: number): string[] {
  const linhas: string[] = [];
  for (const par of texto.split('\n')) {
    let atual = '';
    for (const palavra of par.split(/\s+/)) {
      const tent = atual ? `${atual} ${palavra}` : palavra;
      if (font.widthOfTextAtSize(tent, size) <= largura) atual = tent;
      else {
        if (atual) linhas.push(atual);
        // palavra maior que a largura: corta
        let p = palavra;
        while (font.widthOfTextAtSize(p, size) > largura && p.length > 1) {
          let n = p.length;
          while (n > 1 && font.widthOfTextAtSize(p.slice(0, n), size) > largura) n--;
          linhas.push(p.slice(0, n));
          p = p.slice(n);
        }
        atual = p;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

function adicionarAnotacao(doc: PDFDocument, page: PDFPage, rect: number[], cor: [number, number, number], texto: string) {
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Square',
    Rect: rect,
    C: cor,
    F: 4,
    Border: [0, 0, 1],
    Contents: PDFHexString.fromText(texto),
    T: PDFHexString.fromText('Verificador SINAPI-BA'),
  });
  page.node.addAnnot(doc.context.register(annot));
}

export async function gerarPdfAnotado(bytes: ArrayBuffer, r: Resultado): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const san = sanitizador(font);
  const pages = doc.getPages();

  // marcações numeradas sobre o original
  const grupos = agruparPorCelula(r.correcoes, (c) => (c.loc?.kind === 'pdf' ? `${c.loc.page}:${c.loc.bbox.join(',')}` : undefined));
  const numeroDe = new Map<Correcao, number>();
  let n = 0;
  for (const [, g] of grupos) {
    n++;
    const loc = g.itens[0].loc as Extract<Correcao['loc'], { kind: 'pdf' }>;
    const page = pages[loc.page - 1];
    if (!page) continue;
    const [x0, y0, x1, y1] = loc.bbox;
    const pad = 1.5;
    const cor = CORES[g.marca].rgb;
    page.drawRectangle({
      x: x0 - pad, y: y0 - pad, width: x1 - x0 + 2 * pad, height: y1 - y0 + 2 * pad,
      color: rgb(...cor), opacity: 0.35, borderColor: rgb(cor[0] * 0.6, cor[1] * 0.6, cor[2] * 0.6), borderWidth: 0.8, borderOpacity: 0.9,
    });
    const rotulo = String(n);
    const tam = 5.5;
    const w = bold.widthOfTextAtSize(rotulo, tam) + 2;
    page.drawRectangle({ x: x1 + pad - w, y: y1 + pad, width: w, height: tam + 1.5, color: rgb(0.15, 0.15, 0.15) });
    page.drawText(rotulo, { x: x1 + pad - w + 1, y: y1 + pad + 1, size: tam, font: bold, color: rgb(1, 1, 1) });
    const texto = g.itens.map((c) => textoComentario(r, c)).join('\n\n');
    adicionarAnotacao(doc, page, [x0 - pad, y0 - pad, x1 + pad, y1 + pad], cor, `[${n}] ${texto}`);
    for (const c of g.itens) numeroDe.set(c, n);
  }

  // páginas finais: resumo + lista
  const A4: [number, number] = [595.28, 841.89];
  const margem = 36;
  let page = doc.addPage(A4);
  let y = A4[1] - margem;
  const linha = (txt: string, opts: { size?: number; f?: PDFFont; x?: number; cor?: [number, number, number] } = {}) => {
    const size = opts.size ?? 9;
    if (y < margem + size) {
      page = doc.addPage(A4);
      y = A4[1] - margem;
    }
    page.drawText(san(txt), { x: opts.x ?? margem, y: y - size, size, font: opts.f ?? font, color: rgb(...(opts.cor ?? [0, 0, 0])) });
    y -= size + 4;
  };
  linha('Verificação SINAPI-BA — lista de correções', { size: 14, f: bold });
  y -= 4;
  for (const [k, v] of linhasResumo(r)) linha(`${k}: ${v}`, { size: 8.5 });
  y -= 6;
  linha('Legenda:', { f: bold });
  for (const m of ['corrigido', 'recalculado', 'revisao', 'aviso'] as const) {
    if (y < margem + 12) {
      page = doc.addPage(A4);
      y = A4[1] - margem;
    }
    page.drawRectangle({ x: margem, y: y - 9, width: 14, height: 9, color: rgb(...CORES[m].rgb) });
    linha(CORES[m].nome, { x: margem + 20, size: 8.5 });
  }
  y -= 8;

  const colX = [margem, margem + 26, margem + 70, margem + 140, margem + 260, margem + 345];
  const larguraMotivo = A4[0] - margem - colX[5];
  const cab = ['Nº', 'Página', 'Situação', 'Tipo', 'Original -> Corrigido', 'Motivo'];
  const desenharCabecalho = () => {
    cab.forEach((t, i) => page.drawText(san(t), { x: colX[i], y: y - 9, size: 8, font: bold }));
    y -= 14;
  };
  desenharCabecalho();
  for (const c of r.correcoes) {
    const size = 7.5;
    const valores = c.marca === 'corrigido' || c.marca === 'recalculado'
      ? `${formatarValor(c.campo, c.original)} -> ${formatarValor(c.campo, c.corrigido)}`
      : formatarValor(c.campo, c.original);
    const colunas = [
      numeroDe.has(c) ? String(numeroDe.get(c)) : '—',
      c.loc?.kind === 'pdf' ? String(c.loc.page) : c.linha < 0 ? 'Geral' : '—',
      MARCA_LABEL[c.marca],
      `${TIPO_DIV_LABEL[c.tipo]}${c.campo ? ` (${CAMPO_LABEL[c.campo]})` : ''}`,
      valores,
      c.motivo,
    ].map(san);
    const larguras = [colX[1] - colX[0], colX[2] - colX[1], colX[3] - colX[2], colX[4] - colX[3], colX[5] - colX[4], larguraMotivo].map((w) => w - 4);
    const quebradas = colunas.map((t, i) => quebrar(t, font, size, larguras[i]));
    const altura = Math.max(...quebradas.map((q) => q.length)) * (size + 2) + 4;
    if (y - altura < margem) {
      page = doc.addPage(A4);
      y = A4[1] - margem;
      desenharCabecalho();
    }
    page.drawRectangle({ x: colX[2] - 2, y: y - altura + 2, width: colX[3] - colX[2], height: altura, color: rgb(...CORES[c.marca].rgb) });
    quebradas.forEach((q, i) => q.forEach((t, k) => page.drawText(t, { x: colX[i], y: y - (k + 1) * (size + 2), size, font })));
    page.drawLine({ start: { x: margem, y: y - altura + 1 }, end: { x: A4[0] - margem, y: y - altura + 1 }, thickness: 0.3, color: rgb(0.7, 0.7, 0.7) });
    y -= altura + 2;
  }

  doc.setTitle(`${r.contexto.arquivo} — anotado (Verificador SINAPI-BA)`);
  doc.setProducer('Verificador SINAPI-BA');
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseNone'));
  return doc.save();
}
