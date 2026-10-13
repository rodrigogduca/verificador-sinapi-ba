// Modelo de dados do domínio (design.md §3)

export type Regime = 'nao_desonerado' | 'desonerado';
export type TipoRef = 'composicao' | 'insumo';

export const REGIME_LABEL: Record<Regime, string> = {
  nao_desonerado: 'não desonerado',
  desonerado: 'desonerado',
};

export interface SinapiEntry {
  codigo: string;
  tipo: TipoRef;
  descricao: string;
  unidade: string;
  preco: Partial<Record<Regime, number>>;
}

export interface SinapiTable {
  /** 'AAAA-MM' */
  dataBase: string;
  uf: 'BA';
  entries: Record<string, SinapiEntry>;
  importadoEm: string;
  arquivos: string[];
}

export const entryKey = (tipo: TipoRef, codigo: string) => `${tipo}:${codigo}`;

// ---------- Representação intermediária comum a todos os formatos ----------

export type Loc =
  | { kind: 'xlsx'; sheet: string; address: string; row: number; col: number }
  | { kind: 'pdf'; page: number; bbox: [number, number, number, number] }
  | { kind: 'docx'; table: number; row: number; cell: number };

export interface Cell {
  text: string;
  num?: number;
  loc?: Loc;
  /** Confiança do OCR (0-100). Ausente para texto nativo. */
  confidence?: number;
  formula?: string;
}

export type GridSource = 'xlsx' | 'pdf' | 'ocr' | 'docx';

export interface Grid {
  /** Nome da aba/tabela exibido ao analista */
  name: string;
  rows: Cell[][];
  source: GridSource;
}

export interface Documento {
  arquivo: string;
  source: GridSource;
  /** Uma planilha pode ter várias abas; um docx, várias tabelas; PDF tem um único grid. */
  grids: Grid[];
  fullText: string;
  ocr: boolean;
  /** Bytes do arquivo original (para gerar a cópia corrigida). */
  bytes: ArrayBuffer;
  /** Para PDF/OCR: bytes do PDF sobre o qual as anotações serão desenhadas. */
  pdfBytes?: ArrayBuffer;
}

export const CAMPOS = [
  'item', 'codigo', 'fonte', 'descricao', 'unidade', 'quantidade', 'precoUnit', 'precoUnitBdi', 'total',
] as const;
export type Campo = (typeof CAMPOS)[number];

export const CAMPO_LABEL: Record<Campo, string> = {
  item: 'Item',
  codigo: 'Código',
  fonte: 'Fonte',
  descricao: 'Descrição',
  unidade: 'Unidade',
  quantidade: 'Quantidade',
  precoUnit: 'Preço unit. (sem BDI)',
  precoUnitBdi: 'Preço unit. (com BDI)',
  total: 'Total',
};

export interface Mapeamento {
  headerRow: number;
  colunas: Partial<Record<Campo, number>>;
}

export type TipoLinha = 'item' | 'titulo' | 'subtotal' | 'total' | 'ignorar' | 'nao_reconhecida';

export const TIPO_LINHA_LABEL: Record<TipoLinha, string> = {
  item: 'Item',
  titulo: 'Título/etapa',
  subtotal: 'Subtotal',
  total: 'Total geral',
  ignorar: 'Ignorar',
  nao_reconhecida: 'Não reconhecida',
};

export interface Valores {
  itemNum?: string;
  codigo?: string;
  fonte?: string;
  descricao?: string;
  unidade?: string;
  quantidade?: number;
  precoUnit?: number;
  precoUnitBdi?: number;
  total?: number;
}

export interface Linha {
  /** índice da linha no grid */
  idx: number;
  tipo: TipoLinha;
  cells: Partial<Record<Campo, Cell>>;
  valores: Valores;
}

export interface Metadados {
  /** 'AAAA-MM' */
  dataBase?: string;
  regime?: Regime;
  /** fração: 0.25 = 25% */
  bdi?: number;
  encargos?: number;
}

export interface Orcamento {
  arquivo: string;
  grid: Grid;
  mapeamento: Mapeamento;
  linhas: Linha[];
  meta: Metadados;
  ocr: boolean;
}

// ---------- Resultado da verificação ----------

export type Marca = 'corrigido' | 'recalculado' | 'revisao' | 'aviso';

export type TipoDiv =
  | 'codigo_inexistente'
  | 'sem_referencia'
  | 'unidade_divergente'
  | 'descricao_divergente'
  | 'possivel_codigo_errado'
  | 'preco_divergente'
  | 'regime_ausente'
  | 'total_linha_incorreto'
  | 'total_recalculado'
  | 'somatorio_incorreto'
  | 'somatorio_recalculado'
  | 'preco_bdi_recalculado'
  | 'bdi_incorreto'
  | 'bdi_nao_informado'
  | 'bdi_inconsistente'
  | 'informacao'
  | 'bdi_fora_faixa'
  | 'linha_nao_reconhecida'
  | 'ocr_baixa_confianca';

export const TIPO_DIV_LABEL: Record<TipoDiv, string> = {
  codigo_inexistente: 'Código inexistente no SINAPI',
  sem_referencia: 'Sem referência SINAPI',
  unidade_divergente: 'Unidade divergente',
  descricao_divergente: 'Descrição divergente',
  possivel_codigo_errado: 'Possível código errado',
  preco_divergente: 'Preço unitário divergente',
  regime_ausente: 'Preço do regime não disponível',
  total_linha_incorreto: 'Total da linha incorreto',
  total_recalculado: 'Total recalculado',
  somatorio_incorreto: 'Somatório incorreto',
  somatorio_recalculado: 'Somatório recalculado',
  preco_bdi_recalculado: 'Preço com BDI recalculado',
  bdi_incorreto: 'BDI aplicado incorretamente',
  bdi_nao_informado: 'BDI não informado',
  informacao: 'Informação',
  bdi_inconsistente: 'BDI inconsistente entre itens',
  bdi_fora_faixa: 'BDI fora da faixa de referência (TCU)',
  linha_nao_reconhecida: 'Linha não reconhecida',
  ocr_baixa_confianca: 'Leitura OCR duvidosa',
};

export interface Correcao {
  /** índice da linha no grid (-1 para avisos gerais) */
  linha: number;
  campo?: Campo;
  original?: string | number;
  corrigido?: string | number;
  marca: Marca;
  tipo: TipoDiv;
  motivo: string;
  loc?: Loc;
}

export type StatusLinha = 'ok' | 'corrigido' | 'revisao' | 'sem_referencia' | 'nao_item';

export interface ResultadoLinha {
  linha: Linha;
  status: StatusLinha;
  ref?: SinapiEntry;
  /** valores finais após correção (iguais aos originais quando não há correção) */
  final: Valores;
  correcoes: Correcao[];
}

export interface Resumo {
  itens: number;
  ok: number;
  corrigidos: number;
  revisao: number;
  semRef: number;
  naoReconhecidas: number;
  avisos: number;
  totalOriginal: number;
  totalCorrigido: number;
  porTipo: Partial<Record<TipoDiv, number>>;
}

export interface Contexto {
  arquivo: string;
  dataBase: string;
  regime: Regime;
  bdi?: number;
  encargos?: number;
  verificadoEm: string;
  ocr: boolean;
  tolerancia: number;
}

export interface Resultado {
  linhas: ResultadoLinha[];
  correcoes: Correcao[];
  resumo: Resumo;
  contexto: Contexto;
  mapeamento: Mapeamento;
}

export type TipoObra = 'edificios' | 'rodovias' | 'saneamento' | 'portuarias' | 'fornecimento';

export interface Config {
  tolerancia: number;
  corrigirDescricao: boolean;
  tipoObra: TipoObra;
  /** confiança mínima do OCR para permitir correção automática */
  ocrConfiancaMin: number;
}

export const CONFIG_PADRAO: Config = {
  tolerancia: 0.01,
  corrigirDescricao: true,
  tipoObra: 'edificios',
  ocrConfiancaMin: 70,
};

export const formatDataBase = (db: string) => {
  const [a, m] = db.split('-');
  return `${m}/${a}`;
};
