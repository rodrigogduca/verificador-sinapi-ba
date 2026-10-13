// Números no formato brasileiro e aritmética em centavos.

/**
 * Converte textos como "1.234,56", "R$ 1.234,56", "1234.56", "(1.234,56)", "12,5%" em número.
 * Retorna undefined quando o texto não é um número.
 */
export function parseNumeroBR(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== 'string') return undefined;
  let s = raw.trim();
  if (!s) return undefined;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^R\$\s*/i, '').replace(/\s*%$/, '').replace(/\s/g, '');
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return undefined;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // o separador que aparece por último é o decimal
    normalized = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    if (parts.length > 2) normalized = parts.join(''); // 1,234,567
    else normalized = s.replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    // "1.234" ou "1.234.567" com grupos de 3 → separador de milhar (padrão BR)
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== '0')) {
      normalized = parts.join('');
    } else normalized = s;
  } else normalized = s;

  const n = Number(normalized);
  if (!Number.isFinite(n)) return undefined;
  return neg ? -n : n;
}

/** Percentual "25,5%" → 0.255 ; aceita "25,5" como 25,5%. */
export function parsePercentual(raw: string): number | undefined {
  const n = parseNumeroBR(raw);
  return n === undefined ? undefined : n / 100;
}

export const toCents = (v: number) => Math.round((v + Number.EPSILON * Math.sign(v)) * 100);

/** Arredondamento meio-para-cima com 2 casas, feito em centavos. */
export function round2(v: number): number {
  const sign = v < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(v) * 100 + 1e-7)) / 100;
}

export const iguais = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol + 1e-9;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatBRL = (v: number | undefined) => (v === undefined ? '—' : brl.format(v).replace(/ /g, ' '));
export const formatNum = (v: number | undefined) => (v === undefined ? '—' : num.format(v));
export const formatPct = (v: number | undefined) => (v === undefined ? '—' : pct.format(v).replace(/ /g, ' '));

/** Soma em centavos para evitar erro de ponto flutuante. */
export function somar(valores: number[]): number {
  return valores.reduce((acc, v) => acc + toCents(v), 0) / 100;
}
