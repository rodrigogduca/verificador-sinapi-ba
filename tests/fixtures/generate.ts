// Geração de arquivos de teste sintéticos. VALORES FICTÍCIOS — não são preços SINAPI reais.
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

export interface RefItem {
  codigo: string;
  descricao: string;
  unidade: string;
  nd: number;
  d: number;
}

export const COMPOSICOES: RefItem[] = [
  { codigo: '97083', descricao: 'COMPACTAÇÃO MECÂNICA DE SOLO PARA EXECUÇÃO DE RADIER, PISO DE CONCRETO OU LAJES SOBRE SOLO, COM COMPACTADOR DE SOLOS A PERCUSSÃO. AF_09/2021', unidade: 'M2', nd: 1.17, d: 1.1 },
  { codigo: '96995', descricao: 'REATERRO MANUAL APILOADO COM SOQUETE. AF_10/2017', unidade: 'M3', nd: 41.83, d: 36.92 },
  { codigo: '87878', descricao: 'CHAPISCO APLICADO EM ALVENARIA (SEM PRESENÇA DE VÃOS) E ESTRUTURAS DE CONCRETO DE FACHADA, COM COLHER DE PEDREIRO. ARGAMASSA TRAÇO 1:3 COM PREPARO EM BETONEIRA 400L. AF_10/2022', unidade: 'M2', nd: 4.85, d: 4.41 },
  { codigo: '92873', descricao: 'LANÇAMENTO COM USO DE BALDES, ADENSAMENTO E ACABAMENTO DE CONCRETO EM ESTRUTURAS. AF_02/2022', unidade: 'M3', nd: 222.15, d: 190.3 },
  { codigo: '103328', descricao: 'ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS FURADOS NA HORIZONTAL DE 9X19X19 CM (ESPESSURA 9 CM) E ARGAMASSA DE ASSENTAMENTO COM PREPARO EM BETONEIRA. AF_12/2021', unidade: 'M2', nd: 78.62, d: 72.05 },
  { codigo: '88489', descricao: 'PINTURA LÁTEX ACRÍLICA PREMIUM, APLICAÇÃO MANUAL EM PAREDES, DUAS DEMÃOS. AF_04/2023', unidade: 'M2', nd: 14.92, d: 13.7 },
  { codigo: '94990', descricao: 'EXECUÇÃO DE PASSEIO (CALÇADA) OU PISO DE CONCRETO COM CONCRETO MOLDADO IN LOCO, FEITO EM OBRA, ACABAMENTO CONVENCIONAL, NÃO ARMADO. AF_08/2022', unidade: 'M3', nd: 812.4, d: 770.11 },
];

export const INSUMOS: RefItem[] = [
  { codigo: '00000370', descricao: 'AREIA MEDIA - POSTO JAZIDA/FORNECEDOR (RETIRADO NA JAZIDA, SEM TRANSPORTE)', unidade: 'M3', nd: 98.5, d: 98.5 },
  { codigo: '00001379', descricao: 'CIMENTO PORTLAND COMPOSTO CP II-32', unidade: 'KG', nd: 0.79, d: 0.79 },
  { codigo: '00004750', descricao: 'PEDREIRO (HORISTA)', unidade: 'H', nd: 25.4, d: 22.1 },
];

const toArrayBuffer = (u: Uint8Array | ArrayBuffer | Buffer): ArrayBuffer => {
  if (u instanceof ArrayBuffer) return u;
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
};

/** Formato antigo: um arquivo por tipo e regime, só BA. bookType 'xls' ou 'xlsx'. */
export function sinapiFormatoAntigo(tipo: 'insumo' | 'composicao', regime: 'nd' | 'd', bookType: 'xls' | 'xlsx' = 'xls'): ArrayBuffer {
  const regimeTxt = regime === 'nd' ? 'NÃO DESONERADO' : 'DESONERADO';
  const aoa: unknown[][] = [
    ['SINAPI - SISTEMA NACIONAL DE PESQUISA DE CUSTOS E ÍNDICES DA CONSTRUÇÃO CIVIL'],
    [tipo === 'insumo' ? 'PREÇOS DE INSUMOS' : 'CUSTO DE COMPOSIÇÕES - SINTÉTICO'],
    ['DATA DE PREÇO: 08/2026'],
    ['LOCALIDADE: BAHIA'],
    [`ENCARGOS SOCIAIS: ${regimeTxt}`],
    [],
  ];
  if (tipo === 'insumo') {
    aoa.push(['CODIGO', 'DESCRICAO DO INSUMO', 'UNIDADE', 'ORIGEM DE PRECO', 'PRECO MEDIANO R$']);
    for (const i of INSUMOS) aoa.push([i.codigo, i.descricao, i.unidade, 'C', (regime === 'nd' ? i.nd : i.d).toFixed(2).replace('.', ',')]);
  } else {
    aoa.push(['DESCRICAO DA CLASSE', 'SIGLA DA CLASSE', 'CODIGO DA COMPOSICAO', 'DESCRICAO DA COMPOSICAO', 'UNIDADE', 'ORIGEM DE PRECO', 'CUSTO TOTAL']);
    for (const c of COMPOSICOES) aoa.push(['SERVIÇOS', 'SERV', Number(c.codigo), c.descricao, c.unidade, 'CR', regime === 'nd' ? c.nd : c.d]);
  }
  aoa.push([], ['Fonte: CAIXA']);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Planilha1');
  return toArrayBuffer(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer);
}

/** Formato novo: um arquivo com todas as UFs em colunas, abas ISD/ICD/CSD/CCD/CSE. */
export function sinapiFormatoNovo(): ArrayBuffer {
  const ufs = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE'];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['SINAPI - Menu'], ['Abas: ISD, ICD, CSD, CCD']]), 'Menu');
  for (const [aba, regime] of [['ISD', 'nd'], ['ICD', 'd']] as const) {
    const aoa: unknown[][] = [
      ['SINAPI - Relatório de Insumos'],
      ['Mês de referência: 08/2026'],
      [],
      ['Classificação', 'Código do Insumo', 'Descrição do Insumo', 'Unidade', 'Origem de Preço', ...ufs],
    ];
    INSUMOS.forEach((i, k) =>
      aoa.push(['MATERIAL', Number(i.codigo), i.descricao, i.unidade, 'C', ...ufs.map((uf) => (uf === 'BA' ? (regime === 'nd' ? i.nd : i.d) : 10 + k))]),
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), aba);
  }
  for (const [aba, regime] of [['CSD', 'nd'], ['CCD', 'd'], ['CSE', 'nd']] as const) {
    const ufRow: unknown[] = ['', '', '', ''];
    const hdr: unknown[] = ['Grupo', 'Código da Composição', 'Descrição', 'Unidade'];
    for (const uf of ufs) {
      ufRow.push(uf, '');
      hdr.push('Custo (R$)', '%AS');
    }
    const aoa: unknown[][] = [['SINAPI - Relatório de Composições'], ['Mês de referência: 08/2026'], ufRow, hdr];
    COMPOSICOES.forEach((c) => {
      const row: unknown[] = ['SERVIÇOS', Number(c.codigo), c.descricao, c.unidade];
      for (const uf of ufs) row.push(uf === 'BA' ? (regime === 'nd' ? c.nd : c.d) * (aba === 'CSE' ? 0.5 : 1) : 999, 0.1);
      aoa.push(row);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), aba);
  }
  return toArrayBuffer(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

// ----------------------------------------------------------------------------------------
// Orçamento de teste com erros plantados (BDI 25%, SINAPI-BA 08/2026 não desonerado)
// ----------------------------------------------------------------------------------------

export interface LinhaOrc {
  item: string;
  codigo?: string;
  fonte?: string;
  descricao: string;
  und?: string;
  qtd?: number;
  pu?: number;
  pub?: number;
  total?: number;
  /** linha de etapa (título) */
  titulo?: boolean;
}

const r2 = (v: number) => Math.round(v * 100 + 1e-7) / 100;

export const BDI = 0.25;

/** Linhas do orçamento. Comentários indicam o erro plantado e o resultado esperado. */
export const ORCAMENTO: LinhaOrc[] = [
  { item: '1', descricao: 'SERVIÇOS PRELIMINARES', titulo: true },
  // OK
  { item: '1.1', codigo: '97083', fonte: 'SINAPI', descricao: COMPOSICOES[0].descricao, und: 'm²', qtd: 120, pu: 1.17 },
  // preço errado (45,00 → 41,83); PU c/ BDI e total recalculados
  { item: '1.2', codigo: '96995', fonte: 'SINAPI', descricao: COMPOSICOES[1].descricao, und: 'm3', qtd: 35, pu: 45 },
  { item: '2', descricao: 'ESTRUTURA E ALVENARIA', titulo: true },
  // total da linha errado (3.500,00 → 3.471,13)
  { item: '2.1', codigo: '92873', fonte: 'SINAPI', descricao: COMPOSICOES[3].descricao, und: 'M3', qtd: 12.5, pu: 222.15, total: 3500 },
  // BDI mal aplicado (99,00 → 98,28); total recalculado
  { item: '2.2', codigo: '103328', fonte: 'SINAPI', descricao: COMPOSICOES[4].descricao, und: 'm2', qtd: 250, pu: 78.62, pub: 99 },
  // código inexistente → revisão
  { item: '2.3', codigo: '999999', fonte: 'SINAPI', descricao: 'SERVIÇO QUE NÃO EXISTE NA TABELA', und: 'm2', qtd: 10, pu: 10 },
  { item: '3', descricao: 'ACABAMENTO', titulo: true },
  // descrição resumida → corrigida
  { item: '3.1', codigo: '87878', fonte: 'SINAPI', descricao: 'Chapisco aplicado em alvenaria e estruturas de concreto de fachada, com colher de pedreiro, argamassa traço 1:3', und: 'm2', qtd: 300, pu: 4.85 },
  // unidade errada (m → M2)
  { item: '3.2', codigo: '88489', fonte: 'SINAPI', descricao: COMPOSICOES[5].descricao, und: 'm', qtd: 400, pu: 14.92 },
  // descrição de outro serviço → possível código errado (revisão, sem corrigir preço)
  { item: '3.3', codigo: '94990', fonte: 'SINAPI', descricao: 'ESCAVAÇÃO MANUAL DE VALA EM SOLO DE 1ª CATEGORIA', und: 'm3', qtd: 5, pu: 900 },
  // cotação → sem referência
  { item: '3.4', codigo: 'COT-01', fonte: 'Cotação', descricao: 'Luminária LED de sobrepor 36W', und: 'un', qtd: 10, pu: 80 },
];

/** Valor exibido para o total da etapa 3 (errado de propósito: correto seria 15.903,00). */
export const TOTAL_ETAPA3_ERRADO = 7000;

export function calcularLinha(l: LinhaOrc) {
  const pub = l.pub ?? r2(l.pu! * (1 + BDI));
  const total = l.total ?? r2(l.qtd! * pub);
  return { pub, total };
}

export const CABECALHO = ['Item', 'Código', 'Fonte', 'Descrição', 'Und', 'Quant.', 'Preço Unit. (R$)', 'Preço Unit. c/ BDI (R$)', 'Total (R$)'];

/** Orçamento em .xlsx com fórmulas, célula de BDI em %, mesclagens e totais por etapa. */
export async function orcamentoExcel(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Orçamento');
  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = 'PREFEITURA MUNICIPAL DE EXEMPLO';
  ws.getCell('A2').value = 'OBRA: REFORMA DA ESCOLA MUNICIPAL';
  ws.getCell('A3').value = 'Referência: SINAPI-BA 08/2026 - Não desonerado';
  ws.getCell('A4').value = 'BDI:';
  ws.getCell('B4').value = BDI;
  ws.getCell('B4').numFmt = '0.00%';
  ws.addRow([]);
  ws.getRow(6).values = CABECALHO;

  let r = 7;
  const etapas: { row: number; itens: number[] }[] = [];
  for (const l of ORCAMENTO) {
    const row = ws.getRow(r);
    if (l.titulo) {
      row.getCell(1).value = l.item;
      row.getCell(4).value = l.descricao;
      etapas.push({ row: r, itens: [] });
    } else {
      const { pub, total } = calcularLinha(l);
      etapas[etapas.length - 1].itens.push(r);
      row.getCell(1).value = l.item;
      row.getCell(2).value = l.codigo;
      row.getCell(3).value = l.fonte;
      row.getCell(4).value = l.descricao;
      row.getCell(5).value = l.und;
      row.getCell(6).value = l.qtd;
      row.getCell(7).value = l.pu;
      // itens da etapa 1 usam fórmulas; os demais, valores digitados
      if (l.item.startsWith('1.')) {
        row.getCell(8).value = { formula: `ROUND(G${r}*(1+$B$4),2)`, result: pub };
        row.getCell(9).value = { formula: `ROUND(F${r}*H${r},2)`, result: total };
      } else {
        row.getCell(8).value = pub;
        row.getCell(9).value = total;
      }
      row.getCell(7).numFmt = '#,##0.00';
      row.getCell(8).numFmt = '#,##0.00';
      row.getCell(9).numFmt = '#,##0.00';
    }
    r++;
  }
  // totais das etapas
  const totais: number[] = [];
  etapas.forEach((e, i) => {
    const valores = e.itens.map((rr) => {
      const v = ws.getCell(rr, 9).value as number | { result: number };
      return typeof v === 'number' ? v : v.result;
    });
    const s = r2(valores.reduce((a, b) => a + b, 0));
    if (i === 2) {
      ws.getCell(e.row, 9).value = TOTAL_ETAPA3_ERRADO;
      totais.push(TOTAL_ETAPA3_ERRADO);
    } else {
      ws.getCell(e.row, 9).value = { formula: `SUM(I${e.itens[0]}:I${e.itens[e.itens.length - 1]})`, result: s };
      totais.push(s);
    }
    ws.getCell(e.row, 9).numFmt = '#,##0.00';
  });
  ws.getCell(r, 4).value = 'TOTAL GERAL';
  ws.getCell(r, 9).value = { formula: etapas.map((e) => `I${e.row}`).join('+'), result: r2(totais.reduce((a, b) => a + b, 0)) };
  ws.getCell(r + 2, 1).value = 'Responsável técnico: Eng. Fulano de Tal — CREA 0000';
  const buf = await wb.xlsx.writeBuffer();
  return toArrayBuffer(buf as ArrayBuffer);
}

export function linhaDoItem(item: string): number {
  // linha (1-based) do item na planilha gerada por orcamentoExcel
  return 7 + ORCAMENTO.findIndex((l) => l.item === item);
}
