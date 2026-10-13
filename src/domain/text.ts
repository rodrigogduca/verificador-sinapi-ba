// Normalização de texto, unidades e similaridade de descrições.

export function semAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** minúsculas, sem acentos, sem pontuação, espaços únicos */
export function normalizar(s: string): string {
  return semAcentos(s.toLowerCase())
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const SINONIMOS_UNIDADE: Record<string, string> = {
  und: 'un', unid: 'un', unidade: 'un', u: 'un', ud: 'un', pc: 'un', peca: 'un',
  hr: 'h', hora: 'h', horas: 'h',
  mes: 'mes', meses: 'mes',
  metro: 'm', metros: 'm', ml: 'm',
  m2: 'm2', mq: 'm2',
  m3: 'm3',
  kg: 'kg', quilograma: 'kg',
  l: 'l', litro: 'l', lt: 'l',
  t: 't', ton: 't', tonelada: 't',
  vb: 'vb', verba: 'vb',
  cj: 'cj', conjunto: 'cj', jg: 'jg', jogo: 'jg',
  km: 'km', 'm3xkm': 'm3xkm', 'txkm': 'txkm',
};

export function normalizarUnidade(u: string): string {
  const n = semAcentos(u.toLowerCase())
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/[\s.]/g, '');
  return SINONIMOS_UNIDADE[n] ?? n;
}

export const mesmaUnidade = (a: string, b: string) => normalizarUnidade(a) === normalizarUnidade(b);

function bigramas(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/ /g, '');
  for (let i = 0; i < t.length - 1; i++) {
    const bg = t.slice(i, i + 2);
    m.set(bg, (m.get(bg) ?? 0) + 1);
  }
  return m;
}

/** Coeficiente de Dice sobre bigramas de caracteres (0..1). */
export function dice(a: string, b: string): number {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const ba = bigramas(na);
  const bb = bigramas(nb);
  let inter = 0;
  let total = 0;
  for (const [k, v] of ba) {
    inter += Math.min(v, bb.get(k) ?? 0);
    total += v;
  }
  for (const v of bb.values()) total += v;
  return (2 * inter) / total;
}

/**
 * Fração das palavras do item que aparecem na descrição de referência.
 * Palavras abreviadas ("concr." → "concreto") contam se forem prefixo de uma palavra da referência.
 */
export function contencao(item: string, ref: string): number {
  const pi = normalizar(item).split(' ').filter((w) => w.length > 1);
  if (pi.length === 0) return 0;
  const pr = normalizar(ref).split(' ');
  const setRef = new Set(pr);
  let hits = 0;
  for (const w of pi) {
    if (setRef.has(w) || (w.length >= 3 && pr.some((r) => r.startsWith(w)))) hits++;
  }
  return hits / pi.length;
}

export function similaridade(item: string, ref: string): number {
  return Math.max(dice(item, ref), contencao(item, ref));
}

/** Código SINAPI normalizado: só dígitos, sem zeros à esquerda. "00001379" → "1379"; "SINAPI 87878" → "87878". */
export function normalizarCodigo(raw: string | number | undefined): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim().replace(/^sinapi(-?[ic])?\s*[-:]?\s*/i, '');
  if (!/^\d{1,8}$/.test(s)) return undefined;
  return s.replace(/^0+(?=\d)/, '');
}
