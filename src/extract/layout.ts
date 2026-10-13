// Reconstrução de tabelas a partir de palavras posicionadas (PDF com texto e OCR) — design.md §5.
import { parseNumeroBR } from '../domain/numbers';
import type { Campo, Cell, Grid, GridSource } from '../domain/types';
import { campoDoCabecalho } from './table';

/** Fragmento de texto com caixa em coordenadas PDF (origem embaixo à esquerda). */
export interface Palavra {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  page: number;
  confidence?: number;
}

interface Token extends Palavra {}

interface LinhaPdf {
  page: number;
  y: number;
  h: number;
  tokens: Token[];
}

/** Agrupa palavras em linhas (mesma página, y próximo) e junta fragmentos vizinhos em tokens. */
export function agruparLinhas(palavras: Palavra[]): LinhaPdf[] {
  const porPagina = new Map<number, Palavra[]>();
  for (const p of palavras) {
    if (!p.text.trim()) continue;
    const l = porPagina.get(p.page) ?? [];
    l.push(p);
    porPagina.set(p.page, l);
  }
  const linhas: LinhaPdf[] = [];
  for (const page of [...porPagina.keys()].sort((a, b) => a - b)) {
    const ps = porPagina.get(page)!.sort((a, b) => b.y0 - a.y0 || a.x0 - b.x0);
    const grupos: { y: number; h: number; itens: Palavra[] }[] = [];
    for (const p of ps) {
      const h = Math.max(1, p.y1 - p.y0);
      const yc = (p.y0 + p.y1) / 2;
      const g = grupos.find((gg) => Math.abs(gg.y - yc) < Math.max(gg.h, h) * 0.5);
      if (g) {
        g.itens.push(p);
        g.h = Math.max(g.h, h);
      } else grupos.push({ y: yc, h, itens: [p] });
    }
    grupos.sort((a, b) => b.y - a.y);
    for (const g of grupos) {
      const itens = g.itens.sort((a, b) => a.x0 - b.x0);
      // OCR devolve palavra a palavra: junta palavras da mesma frase (espaço ~ altura da letra);
      // texto nativo do PDF já vem em trechos, então só junta fragmentos colados
      const ocr = itens.some((it) => it.confidence !== undefined);
      const alturas = itens.map((it) => it.y1 - it.y0).sort((a, b) => a - b);
      const hMed = alturas[Math.floor(alturas.length / 2)] ?? g.h;
      const limiteGap = ocr ? hMed * 0.9 : Math.max(1.5, g.h * 0.35);
      const tokens: Token[] = [];
      for (const it of itens) {
        const ult = tokens[tokens.length - 1];
        const gap = ult ? it.x0 - ult.x1 : Infinity;
        if (ult && gap < limiteGap) {
          ult.text += (ocr || gap > g.h * 0.12 ? ' ' : '') + it.text;
          ult.x1 = Math.max(ult.x1, it.x1);
          ult.y0 = Math.min(ult.y0, it.y0);
          ult.y1 = Math.max(ult.y1, it.y1);
          if (it.confidence !== undefined) ult.confidence = Math.min(ult.confidence ?? 100, it.confidence);
        } else tokens.push({ ...it, text: it.text });
      }
      for (const t of tokens) t.text = t.text.replace(/\s+/g, ' ').trim();
      linhas.push({ page, y: g.y, h: g.h, tokens: tokens.filter((t) => t.text) });
    }
  }
  return linhas;
}

interface Coluna {
  x0: number;
  x1: number;
  campo?: Campo;
  texto: string;
}

function pontuarCabecalho(l: LinhaPdf): number {
  const campos = new Set(l.tokens.map((t) => campoDoCabecalho(t.text)).filter(Boolean));
  if (!campos.has('descricao') && !campos.has('codigo')) return 0;
  if (!campos.has('quantidade') && !campos.has('total') && !campos.has('precoUnit')) return 0;
  return campos.size;
}

/** Cabeçalho em duas linhas ("Preço" / "Unit."): junta tokens que se sobrepõem na horizontal. */
function combinarCabecalho(a: LinhaPdf, b: LinhaPdf | undefined): LinhaPdf {
  if (!b || b.page !== a.page || a.y - b.y > a.h * 2.2) return a;
  const tokens = a.tokens.map((t) => ({ ...t }));
  for (const tb of b.tokens) {
    const alvo = tokens.find((t) => Math.min(t.x1, tb.x1) - Math.max(t.x0, tb.x0) > 0);
    if (alvo) {
      alvo.text = `${alvo.text} ${tb.text}`;
      alvo.x0 = Math.min(alvo.x0, tb.x0);
      alvo.x1 = Math.max(alvo.x1, tb.x1);
    } else tokens.push({ ...tb });
  }
  tokens.sort((x, y) => x.x0 - y.x0);
  return { ...a, tokens };
}

function colunasDoCabecalho(l: LinhaPdf): Coluna[] {
  return l.tokens.map((t) => ({ x0: t.x0, x1: t.x1, campo: campoDoCabecalho(t.text), texto: t.text }));
}

function colunaDoToken(t: Token, cols: Coluna[]): number {
  let melhor = -1;
  let melhorSobre = 0;
  cols.forEach((c, i) => {
    const sobre = Math.min(c.x1, t.x1) - Math.max(c.x0, t.x0);
    if (sobre > melhorSobre) {
      melhorSobre = sobre;
      melhor = i;
    }
  });
  if (melhor >= 0) return melhor;
  // sem sobreposição: coluna de centro mais próximo
  const xc = (t.x0 + t.x1) / 2;
  let dist = Infinity;
  cols.forEach((c, i) => {
    const d = Math.abs((c.x0 + c.x1) / 2 - xc);
    if (d < dist) {
      dist = d;
      melhor = i;
    }
  });
  return melhor;
}

const celulaDe = (t: Token): Cell => ({
  text: t.text,
  num: parseNumeroBR(t.text),
  confidence: t.confidence,
  loc: { kind: 'pdf', page: t.page, bbox: [t.x0, t.y0, t.x1, t.y1] },
});

function juntarCelula(a: Cell | undefined, t: Token): Cell {
  if (!a || !a.text) return celulaDe(t);
  const bb = a.loc?.kind === 'pdf' ? a.loc.bbox : [t.x0, t.y0, t.x1, t.y1];
  const text = `${a.text} ${t.text}`;
  return {
    text,
    num: parseNumeroBR(text),
    confidence: t.confidence !== undefined || a.confidence !== undefined ? Math.min(a.confidence ?? 100, t.confidence ?? 100) : undefined,
    loc: { kind: 'pdf', page: t.page, bbox: [Math.min(bb[0], t.x0), Math.min(bb[1], t.y0), Math.max(bb[2], t.x1), Math.max(bb[3], t.y1)] },
  };
}

/** Linhas → Grid alinhado pelas colunas do cabeçalho (redetectado a cada página). */
export function montarGridPosicional(palavras: Palavra[], source: GridSource, nome: string): Grid {
  const linhas = agruparLinhas(palavras);
  const rows: Cell[][] = [];
  let cols: Coluna[] | undefined;
  const tipoLinha: ('pre' | 'cab' | 'dado')[] = [];
  const ys: { page: number; y: number; h: number }[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const score = pontuarCabecalho(l);
    const comb = combinarCabecalho(l, linhas[i + 1]);
    const scoreComb = comb !== l ? pontuarCabecalho(comb) : 0;
    if (Math.max(score, scoreComb) >= 3) {
      const cab = scoreComb > score ? comb : l;
      cols = colunasDoCabecalho(cab);
      rows.push(cols.map((c, k) => ({ text: c.texto, loc: { kind: 'pdf', page: l.page, bbox: [c.x0, cab.tokens[k].y0, c.x1, cab.tokens[k].y1] } })));
      tipoLinha.push('cab');
      ys.push({ page: l.page, y: l.y, h: l.h });
      if (scoreComb > score) i++; // a segunda linha do cabeçalho já foi consumida
      continue;
    }
    if (!cols) {
      rows.push([{ text: l.tokens.map((t) => t.text).join(' ') }]);
      tipoLinha.push('pre');
      ys.push({ page: l.page, y: l.y, h: l.h });
      continue;
    }
    const row: Cell[] = cols.map(() => ({ text: '' }));
    for (const t of l.tokens) {
      const c = colunaDoToken(t, cols);
      row[c] = juntarCelula(row[c].text ? row[c] : undefined, t);
    }
    rows.push(row);
    tipoLinha.push('dado');
    ys.push({ page: l.page, y: l.y, h: l.h });
  }

  // continuação de descrição: linha só com texto na coluna "descricao" vai para a linha vizinha mais próxima
  if (cols) {
    const colDesc = cols.findIndex((c) => c.campo === 'descricao');
    if (colDesc >= 0) {
      const soDescricao = (r: Cell[], k: number) =>
        tipoLinha[k] === 'dado' && r[colDesc]?.text && r.every((c, j) => j === colDesc || !c.text);
      const remover = new Set<number>();
      const tokenDe = (k: number): Token => {
        const c = rows[k][colDesc];
        const bb = (c.loc as { bbox: [number, number, number, number] }).bbox;
        return { text: c.text, x0: bb[0], y0: bb[1], x1: bb[2], y1: bb[3], page: ys[k].page, confidence: c.confidence };
      };
      for (let k = 0; k < rows.length; k++) {
        if (!soDescricao(rows[k], k)) continue;
        // bloco de linhas consecutivas só com descrição (mesma página)
        let fim = k;
        while (fim + 1 < rows.length && soDescricao(rows[fim + 1], fim + 1) && ys[fim + 1].page === ys[k].page) fim++;
        const ant = k - 1;
        const prox = fim + 1;
        const valido = (j: number) => j >= 0 && j < rows.length && tipoLinha[j] === 'dado' && ys[j].page === ys[k].page;
        const dAnt = valido(ant) ? Math.abs(ys[ant].y - ys[k].y) : Infinity;
        const dProx = valido(prox) ? Math.abs(ys[prox].y - ys[fim].y) : Infinity;
        const limite = ys[k].h * 3;
        if (Math.min(dAnt, dProx) > limite) {
          k = fim;
          continue;
        }
        const alvo = dAnt <= dProx ? ant : prox;
        const bloco = Array.from({ length: fim - k + 1 }, (_, i) => k + i);
        let celula = rows[alvo][colDesc];
        if (alvo < k) {
          for (const j of bloco) celula = juntarCelula(celula?.text ? celula : undefined, tokenDe(j));
        } else {
          // bloco acima do item: o texto do bloco vem antes do texto da linha do item
          const textoAlvo = celula?.text ?? '';
          let novo: Cell | undefined;
          for (const j of bloco) novo = juntarCelula(novo, tokenDe(j));
          if (celula?.text) {
            const bb = (celula.loc as { bbox: [number, number, number, number] }).bbox;
            novo = juntarCelula(novo, { text: textoAlvo, x0: bb[0], y0: bb[1], x1: bb[2], y1: bb[3], page: ys[alvo].page, confidence: celula.confidence });
          }
          celula = novo!;
        }
        rows[alvo][colDesc] = celula;
        for (const j of bloco) remover.add(j);
        k = fim;
      }
      const filtradas = rows.filter((_, k) => !remover.has(k));
      return { name: nome, rows: filtradas, source };
    }
  }
  return { name: nome, rows, source };
}
