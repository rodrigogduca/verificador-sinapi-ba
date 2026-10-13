// Importação das planilhas oficiais SINAPI (design.md §4).
// Aceita o formato antigo (um arquivo por estado/regime) e o novo (todas as UFs em colunas).
import * as XLSX from 'xlsx';
import { normalizar, normalizarCodigo } from '../domain/text';
import { parseNumeroBR } from '../domain/numbers';
import { entryKey, type Regime, type SinapiEntry, type SinapiTable, type TipoRef } from '../domain/types';

export interface SheetMatrix {
  name: string;
  rows: unknown[][];
}

export interface AbaDetectada {
  nome: string;
  tipo?: TipoRef;
  regime?: Regime;
  /** motivo pelo qual a aba não será importada */
  ignorada?: string;
  headerRow?: number;
  colunas?: { codigo: number; descricao: number; unidade: number; preco: number };
  /** rótulo da coluna de preço usada (ex.: "BA", "PRECO MEDIANO R$") */
  colunaPreco?: string;
  entradas: Omit<SinapiEntry, 'preco'>[];
  precos: (number | undefined)[];
}

export interface PreviaImportacao {
  arquivo: string;
  dataBase?: string;
  abas: AbaDetectada[];
}

export function lerPlanilhaSinapi(bytes: ArrayBuffer): SheetMatrix[] {
  const wb = XLSX.read(bytes, { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: true }),
  }));
}

const txt = (v: unknown) => (v === undefined || v === null ? '' : String(v));

export function detectarDataBase(...fontes: string[]): string | undefined {
  for (const f of fontes) {
    const s = f ?? '';
    const a = s.match(/(?<!\d)(20\d{2})[_\-/.]?(0[1-9]|1[0-2])(?!\d)/);
    if (a) return `${a[1]}-${a[2]}`;
    const b = s.match(/(?<!\d)(0[1-9]|1[0-2])[_\-/.]?(20\d{2})(?!\d)/);
    if (b) return `${b[2]}-${b[1]}`;
  }
  return undefined;
}

function regimePorTexto(s: string): Regime | 'ignorar' | undefined {
  const n = normalizar(s).replace(/\s+/g, '');
  if (/naodesonerad|semdesonera/.test(n)) return 'nao_desonerado';
  if (/semencargo/.test(n)) return 'ignorar';
  if (/comdesonera|desonerad/.test(n)) return 'desonerado';
  return undefined;
}

function regimePorNomeAba(nome: string): Regime | 'ignorar' | undefined {
  const n = normalizar(nome).replace(/\s+/g, '');
  if (/^[ic]sd$/.test(n)) return 'nao_desonerado';
  if (/^[ic]cd$/.test(n)) return 'desonerado';
  if (/^[ic]se$/.test(n)) return 'ignorar';
  return regimePorTexto(nome);
}

function tipoPorTexto(s: string): TipoRef | undefined {
  const n = normalizar(s);
  if (/composic/.test(n)) return 'composicao';
  if (/insumo/.test(n)) return 'insumo';
  return undefined;
}

function tipoPorNomeAba(nome: string): TipoRef | undefined {
  const n = normalizar(nome).replace(/\s+/g, '');
  if (/^i(sd|cd|se)$/.test(n)) return 'insumo';
  if (/^c(sd|cd|se)$/.test(n)) return 'composicao';
  return tipoPorTexto(nome);
}

interface Cabecalho {
  row: number;
  codigo: number;
  descricao: number;
  unidade: number;
  preco: number;
  rotuloPreco: string;
  textoCodigo: string;
}

function escolher(cands: { col: number; h: string }[], prefer: RegExp, evitar: RegExp): number | undefined {
  const ok = cands.filter((c) => !evitar.test(c.h));
  const lista = ok.length ? ok : cands;
  return (lista.find((c) => prefer.test(c.h)) ?? lista[0])?.col;
}

function acharCabecalho(rows: unknown[][]): Cabecalho | undefined {
  const limite = Math.min(rows.length, 40);
  for (let r = 0; r < limite; r++) {
    const linha = rows[r] ?? [];
    const hs = linha.map((v, col) => ({ col, h: normalizar(txt(v)) }));
    const cod = hs.filter((c) => /^cod(igo)?\b/.test(c.h));
    const desc = hs.filter((c) => /^descri/.test(c.h));
    const unid = hs.filter((c) => /^(unidade|unid|und|un)\b/.test(c.h));
    if (!cod.length || !desc.length || !unid.length) continue;

    const evitar = /aglutin|classe|tipo|grupo/;
    const codigo = escolher(cod, /composic|insumo|^codigo$/, evitar)!;
    const descricao = escolher(desc, /composic|insumo|^descricao$/, evitar)!;
    const unidade = unid[0].col;

    // formato novo: coluna com cabeçalho "BA" na linha do cabeçalho ou até 2 linhas acima
    let preco: number | undefined;
    let rotulo = '';
    for (let k = r; k >= Math.max(0, r - 2) && preco === undefined; k--) {
      const idx = (rows[k] ?? []).findIndex((v) => normalizar(txt(v)) === 'ba');
      if (idx >= 0) {
        preco = idx;
        rotulo = 'BA';
      }
    }
    if (preco === undefined) {
      const precos = hs.filter((c) => /preco|custo/.test(c.h) && !/%|percent|origem/.test(c.h));
      const p = escolher(precos, /custo total|mediano/, /^$/);
      if (p !== undefined) {
        preco = p;
        rotulo = txt(linha[p]);
      }
    }
    if (preco === undefined) continue;
    return { row: r, codigo, descricao, unidade, preco, rotuloPreco: rotulo, textoCodigo: hs[codigo].h };
  }
  return undefined;
}

export function analisarSinapi(arquivo: string, abas: SheetMatrix[]): PreviaImportacao {
  const textoTopo = (rows: unknown[][], ate: number) =>
    rows.slice(0, ate).map((r) => r.map(txt).join(' ')).join(' \n ');

  let dataBase = detectarDataBase(arquivo);
  const arquivoAnalitico = /analit/i.test(normalizar(arquivo));
  const resultado: AbaDetectada[] = [];

  for (const aba of abas) {
    const det: AbaDetectada = { nome: aba.name, entradas: [], precos: [] };
    resultado.push(det);
    const nomeN = normalizar(aba.name);
    if (arquivoAnalitico || /analit|menu|busca|instruc|leia/.test(nomeN)) {
      det.ignorada = 'aba de consulta/analítica';
      continue;
    }
    const cab = acharCabecalho(aba.rows);
    if (!cab) {
      det.ignorada = 'cabeçalho de código/descrição/unidade/preço não encontrado';
      continue;
    }
    const topo = textoTopo(aba.rows, cab.row + 1);
    dataBase ??= detectarDataBase(topo);

    const regime = regimePorNomeAba(aba.name) ?? regimePorTexto(topo) ?? regimePorTexto(arquivo);
    if (regime === 'ignorar') {
      det.ignorada = 'tabela sem encargos sociais (não usada em orçamentos)';
      continue;
    }
    det.regime = regime;
    det.tipo = tipoPorNomeAba(aba.name) ?? tipoPorTexto(cab.textoCodigo) ?? tipoPorTexto(arquivo) ?? tipoPorTexto(topo);
    det.headerRow = cab.row;
    det.colunas = { codigo: cab.codigo, descricao: cab.descricao, unidade: cab.unidade, preco: cab.preco };
    det.colunaPreco = cab.rotuloPreco;

    for (let r = cab.row + 1; r < aba.rows.length; r++) {
      const row = aba.rows[r] ?? [];
      const codigo = normalizarCodigo(txt(row[cab.codigo]));
      if (!codigo) continue;
      const descricao = txt(row[cab.descricao]).trim();
      if (!descricao) continue;
      det.entradas.push({ codigo, tipo: det.tipo ?? 'composicao', descricao, unidade: txt(row[cab.unidade]).trim() });
      det.precos.push(parseNumeroBR(row[cab.preco] as string | number));
    }
    if (det.entradas.length === 0) det.ignorada = 'nenhum item com código numérico';
  }
  return { arquivo, dataBase, abas: resultado };
}

export interface AjustesImportacao {
  dataBase: string;
  /** regime/tipo escolhidos pelo analista quando não detectados */
  porAba?: Record<string, { regime?: Regime; tipo?: TipoRef }>;
}

export function abasPendentes(p: PreviaImportacao, aj?: AjustesImportacao): string[] {
  return p.abas
    .filter((a) => !a.ignorada)
    .filter((a) => !(aj?.porAba?.[a.nome]?.regime ?? a.regime) || !(aj?.porAba?.[a.nome]?.tipo ?? a.tipo))
    .map((a) => a.nome);
}

/** Mescla a prévia numa tabela (nova ou existente) da mesma data-base. */
export function mesclarSinapi(
  existente: SinapiTable | undefined,
  previa: PreviaImportacao,
  aj: AjustesImportacao,
): SinapiTable {
  const tabela: SinapiTable = existente
    ? { ...existente, entries: { ...existente.entries }, arquivos: [...existente.arquivos] }
    : { dataBase: aj.dataBase, uf: 'BA', entries: {}, importadoEm: '', arquivos: [] };
  tabela.importadoEm = new Date().toISOString();
  if (!tabela.arquivos.includes(previa.arquivo)) tabela.arquivos.push(previa.arquivo);

  for (const aba of previa.abas) {
    if (aba.ignorada) continue;
    const regime = aj.porAba?.[aba.nome]?.regime ?? aba.regime;
    const tipo = aj.porAba?.[aba.nome]?.tipo ?? aba.tipo;
    if (!regime || !tipo) throw new Error(`Informe o regime e o tipo da aba "${aba.nome}".`);
    aba.entradas.forEach((e, i) => {
      const key = entryKey(tipo, e.codigo);
      const atual = tabela.entries[key];
      const preco = { ...(atual?.preco ?? {}) };
      const p = aba.precos[i];
      if (p !== undefined) preco[regime] = p;
      tabela.entries[key] = { ...e, tipo, preco };
    });
  }
  return tabela;
}

export function estatisticas(t: SinapiTable) {
  let composicoes = 0, insumos = 0, nd = 0, d = 0;
  for (const e of Object.values(t.entries)) {
    if (e.tipo === 'composicao') composicoes++;
    else insumos++;
    if (e.preco.nao_desonerado !== undefined) nd++;
    if (e.preco.desonerado !== undefined) d++;
  }
  return { composicoes, insumos, comPrecoNaoDesonerado: nd, comPrecoDesonerado: d };
}
