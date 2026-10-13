// Detecção do cabeçalho, mapeamento de colunas e classificação das linhas (design.md §5.1).
import { parseNumeroBR } from '../domain/numbers';
import { normalizar } from '../domain/text';
import type { Campo, Cell, Grid, Linha, Mapeamento, TipoLinha, Valores } from '../domain/types';

/** Classifica o texto de uma célula de cabeçalho. */
export function campoDoCabecalho(raw: string): Campo | undefined {
  const h = normalizar(raw);
  if (!h || h.length > 60) return undefined;
  if (/^(item|it|n|no|ord|ordem|seq)$/.test(h)) return 'item';
  if (/^(fonte|banco|base|origem|tabela|ref fonte|fonte ref)\b/.test(h) && !/descri/.test(h)) return 'fonte';
  if (/\bcod(igo)?\b|^codigo/.test(h)) return 'codigo';
  if (/descri|discrimina|especifica|^servicos?$/.test(h)) return 'descricao';
  if (/^(unid|und|un|unidade|u|ud)\b/.test(h)) return 'unidade';
  if (/^(quant|qtd|qtde|qde|quantidade)/.test(h)) return 'quantidade';
  const temBdi = /\bbdi\b/.test(h);
  const semBdi = /\b(s|sem)\s*bdi\b/.test(h);
  if (/total/.test(h)) return 'total';
  const preco = /\bunit|^(preco|valor|custo|p)\b/.test(h);
  if (preco && temBdi && !semBdi) return 'precoUnitBdi';
  if (preco) return 'precoUnit';
  return undefined;
}

function pontuarLinha(cells: string[]): { score: number; cols: Partial<Record<Campo, number>> } {
  const cols: Partial<Record<Campo, number>> = {};
  cells.forEach((t, i) => {
    const campo = campoDoCabecalho(t);
    if (!campo) return;
    if (campo === 'total') cols.total = i; // vários "total": fica o último (normalmente com BDI)
    else if (cols[campo] === undefined) cols[campo] = i;
  });
  let score = Object.keys(cols).length;
  if (cols.descricao === undefined && cols.codigo === undefined) score = 0;
  if (cols.quantidade === undefined && cols.total === undefined && cols.precoUnit === undefined) score = 0;
  return { score, cols };
}

/** Procura a linha de cabeçalho (ou par de linhas) com mais campos reconhecidos. */
export function detectarMapeamento(grid: Grid, limite = 80): Mapeamento | undefined {
  let melhor: { score: number; m: Mapeamento } | undefined;
  const n = Math.min(grid.rows.length, limite);
  for (let r = 0; r < n; r++) {
    const a = grid.rows[r].map((c) => c.text);
    const simples = pontuarLinha(a);
    if (simples.score >= 3 && (!melhor || simples.score > melhor.score)) {
      melhor = { score: simples.score, m: { headerRow: r, colunas: simples.cols } };
    }
    if (r + 1 < grid.rows.length) {
      const b = grid.rows[r + 1].map((c) => c.text);
      const len = Math.max(a.length, b.length);
      const comb = Array.from({ length: len }, (_, i) => `${a[i] ?? ''} ${b[i] ?? ''}`.trim());
      const duplo = pontuarLinha(comb);
      // só vale a pena se a segunda linha acrescenta campos
      if (duplo.score >= 3 && duplo.score > simples.score && (!melhor || duplo.score > melhor.score)) {
        melhor = { score: duplo.score, m: { headerRow: r + 1, colunas: duplo.cols } };
      }
    }
  }
  return melhor?.m;
}

const numDe = (c?: Cell) => (c ? (c.num ?? parseNumeroBR(c.text)) : undefined);
const txtDe = (c?: Cell) => (c?.text ?? '').trim() || undefined;

const RE_TOTAL_GERAL = /total geral|valor total|total do orcamento|total global|total da obra|preco total da obra|total com bdi|total sem bdi|total c bdi|total s bdi/;
const RE_SUBTOTAL = /^(sub ?total|total)\b/;

export function extrairLinhas(grid: Grid, m: Mapeamento): Linha[] {
  const linhas: Linha[] = [];
  let depoisDoTotal = false;
  const headerCols = new Set(Object.values(m.colunas));

  for (let r = m.headerRow + 1; r < grid.rows.length; r++) {
    const row = grid.rows[r];
    const cells: Partial<Record<Campo, Cell>> = {};
    for (const [campo, col] of Object.entries(m.colunas) as [Campo, number][]) {
      if (row[col]) cells[campo] = row[col];
    }
    const valores: Valores = {
      itemNum: txtDe(cells.item)?.replace(/,/g, '.'),
      codigo: txtDe(cells.codigo),
      fonte: txtDe(cells.fonte),
      descricao: txtDe(cells.descricao),
      unidade: txtDe(cells.unidade),
      quantidade: numDe(cells.quantidade),
      precoUnit: numDe(cells.precoUnit),
      precoUnitBdi: numDe(cells.precoUnitBdi),
      total: numDe(cells.total),
    };
    const textos = row.map((c) => c.text).filter(Boolean);
    const textoN = normalizar(textos.join(' '));
    let tipo: TipoLinha;

    const repeteCabecalho =
      row.filter((c, i) => headerCols.has(i) && campoDoCabecalho(c.text) !== undefined).length >= 3;

    if (textos.length === 0) tipo = 'ignorar';
    else if (repeteCabecalho) tipo = 'ignorar';
    else if (valores.quantidade !== undefined && (valores.precoUnit ?? valores.precoUnitBdi ?? valores.total) !== undefined && !RE_SUBTOTAL.test(normalizar(valores.descricao ?? ''))) {
      tipo = 'item';
    } else if (RE_TOTAL_GERAL.test(textoN)) tipo = 'total';
    else if (textos.some((t) => RE_SUBTOTAL.test(normalizar(t)))) tipo = 'subtotal';
    else if (depoisDoTotal) tipo = 'ignorar';
    else if (valores.quantidade === undefined && (valores.descricao || textos.some((t) => parseNumeroBR(t) === undefined))) {
      tipo = 'titulo';
    } else tipo = 'nao_reconhecida';

    // subtotal/total sem valor na coluna total: usa o último número da linha
    if ((tipo === 'subtotal' || tipo === 'total') && valores.total === undefined) {
      for (let i = row.length - 1; i >= 0; i--) {
        const n = numDe(row[i]);
        if (n !== undefined && !/%/.test(row[i].text)) {
          valores.total = n;
          cells.total = row[i];
          break;
        }
      }
    }
    if (tipo === 'total') depoisDoTotal = true;
    linhas.push({ idx: r, tipo, cells, valores });
  }
  return linhas;
}

/** Escolhe o grid (aba/tabela) com mais linhas de item. */
export function escolherGrid(grids: Grid[]): { grid: Grid; mapeamento?: Mapeamento; indice: number } {
  let best = { indice: 0, itens: -1, mapeamento: undefined as Mapeamento | undefined };
  grids.forEach((g, i) => {
    const m = detectarMapeamento(g);
    const itens = m ? extrairLinhas(g, m).filter((l) => l.tipo === 'item').length : 0;
    if (itens > best.itens) best = { indice: i, itens, mapeamento: m };
  });
  return { grid: grids[best.indice], mapeamento: best.mapeamento, indice: best.indice };
}

/** Rótulo de coluna estilo planilha: 0 → A, 26 → AA */
export function letraColuna(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
