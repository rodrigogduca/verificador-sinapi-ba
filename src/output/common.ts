// Cores, textos de comentário e utilidades comuns aos geradores de saída (design.md §7).
import { formatBRL, formatNum, formatPct } from '../domain/numbers';
import {
  CAMPO_LABEL, formatDataBase, REGIME_LABEL, TIPO_DIV_LABEL,
  type Campo, type Correcao, type Loc, type Marca, type Resultado,
} from '../domain/types';

export const CORES: Record<Marca, { hex: string; nome: string; rgb: [number, number, number] }> = {
  corrigido: { hex: 'F8B4B4', nome: 'Vermelho — valor corrigido', rgb: [0.97, 0.71, 0.71] },
  recalculado: { hex: 'FFF3A3', nome: 'Amarelo — recalculado por consequência', rgb: [1, 0.95, 0.64] },
  revisao: { hex: 'FFC98B', nome: 'Laranja — revisão manual necessária', rgb: [1, 0.79, 0.55] },
  aviso: { hex: 'BFDBFE', nome: 'Azul — aviso/informação', rgb: [0.75, 0.86, 1] },
};

export const MARCA_LABEL: Record<Marca, string> = {
  corrigido: 'Corrigido',
  recalculado: 'Recalculado',
  revisao: 'Revisão manual',
  aviso: 'Aviso',
};

/** Prioridade quando várias marcas caem na mesma célula. */
export const PRIORIDADE: Record<Marca, number> = { revisao: 4, corrigido: 3, recalculado: 2, aviso: 1 };

const CAMPOS_DINHEIRO: Campo[] = ['precoUnit', 'precoUnitBdi', 'total'];

export function formatarValor(campo: Campo | undefined, v: string | number | undefined): string {
  if (v === undefined || v === '') return '—';
  if (typeof v === 'number') return campo && CAMPOS_DINHEIRO.includes(campo) ? formatBRL(v) : formatNum(v);
  return v;
}

export function rotuloReferencia(r: Resultado): string {
  return `SINAPI-BA ${formatDataBase(r.contexto.dataBase)} – ${REGIME_LABEL[r.contexto.regime]}`;
}

export function textoComentario(r: Resultado, c: Correcao): string {
  const partes = [`[${rotuloReferencia(r)}] ${TIPO_DIV_LABEL[c.tipo]}. ${c.motivo}`];
  if (c.marca === 'corrigido' || c.marca === 'recalculado') {
    partes.push(`Original: ${formatarValor(c.campo, c.original)} -> corrigido: ${formatarValor(c.campo, c.corrigido)}.`);
  }
  return partes.join(' ');
}

export function descreverLoc(loc?: Loc): string {
  if (!loc) return '—';
  if (loc.kind === 'xlsx') return `${loc.sheet}!${loc.address}`;
  if (loc.kind === 'pdf') return `pág. ${loc.page}`;
  return `tabela ${loc.table + 1}, linha ${loc.row + 1}, célula ${loc.cell + 1}`;
}

export const campoLabel = (c?: Campo) => (c ? CAMPO_LABEL[c] : '—');

export function linhasResumo(r: Resultado): [string, string][] {
  const s = r.resumo;
  const c = r.contexto;
  return [
    ['Arquivo verificado', c.arquivo],
    ['Referência', rotuloReferencia(r)],
    ['BDI', c.bdi !== undefined ? formatPct(c.bdi) : 'não informado'],
    ['Encargos sociais (informado)', c.encargos !== undefined ? formatPct(c.encargos) : '—'],
    ['Verificado em', new Date(c.verificadoEm).toLocaleString('pt-BR')],
    ['Leitura por OCR', c.ocr ? 'SIM — pode conter erros de leitura' : 'não'],
    ['Tolerância', formatBRL(c.tolerancia)],
    ['Itens', String(s.itens)],
    ['Itens OK', String(s.ok)],
    ['Itens corrigidos', String(s.corrigidos)],
    ['Linhas para revisão manual', String(s.revisao)],
    ['Itens sem referência SINAPI', String(s.semRef)],
    ['Linhas não reconhecidas', String(s.naoReconhecidas)],
    ['Valor total original', formatBRL(s.totalOriginal)],
    ['Valor total corrigido', formatBRL(s.totalCorrigido)],
    ['Diferença', formatBRL(Math.round((s.totalCorrigido - s.totalOriginal) * 100) / 100)],
  ];
}

export function nomeSaida(arquivo: string, sufixo: string, ext: string): string {
  const base = arquivo.replace(/\.[^.]+$/, '');
  return `${base}_${sufixo}.${ext}`;
}

/** Agrupa correções por célula, mantendo a marca de maior prioridade. */
export function agruparPorCelula<K>(cs: Correcao[], chave: (c: Correcao) => K | undefined) {
  const m = new Map<K, { marca: Marca; itens: Correcao[] }>();
  for (const c of cs) {
    const k = chave(c);
    if (k === undefined) continue;
    const atual = m.get(k);
    if (!atual) m.set(k, { marca: c.marca, itens: [c] });
    else {
      atual.itens.push(c);
      if (PRIORIDADE[c.marca] > PRIORIDADE[atual.marca]) atual.marca = c.marca;
    }
  }
  return m;
}
