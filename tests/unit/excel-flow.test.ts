import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG_PADRAO, type Resultado } from '../../src/domain/types';
import { lerDocumento, montarOrcamento, prepararAutomatico } from '../../src/extract';
import { verificar } from '../../src/verify/engine';
import { gerarExcelCorrigido, gerarExcelDeTabela } from '../../src/output/excel';
import { CORES } from '../../src/output/common';
import { linhaDoItem, orcamentoExcel } from '../fixtures/generate';
import { tabelaTeste } from './helpers';

let resultado: Resultado;
let bytes: ArrayBuffer;

const div = (item: string) => resultado.linhas.find((l) => l.linha.valores.itemNum === item)!;
const tipos = (item: string) => div(item).correcoes.map((c) => `${c.tipo}:${c.marca}`).sort();

beforeAll(async () => {
  bytes = await orcamentoExcel();
  const doc = await lerDocumento('orcamento.xlsx', bytes);
  const prep = prepararAutomatico(doc);
  expect(prep.mapeamento).toBeDefined();
  expect(prep.meta).toMatchObject({ dataBase: '2026-08', regime: 'nao_desonerado', bdi: 0.25 });
  const orc = montarOrcamento(doc, doc.grids[prep.indiceGrid], prep.mapeamento!, prep.meta);
  resultado = verificar(orc, tabelaTeste(), { dataBase: '2026-08', regime: 'nao_desonerado', bdi: 0.25 }, CONFIG_PADRAO);
});

describe('fluxo Excel: extração + verificação', () => {
  it('reconhece cabeçalho, itens, títulos, total geral e ignora rodapé', () => {
    const m = resultado.mapeamento;
    expect(m.headerRow).toBe(5);
    expect(Object.keys(m.colunas).sort()).toEqual(['codigo', 'descricao', 'fonte', 'item', 'precoUnit', 'precoUnitBdi', 'quantidade', 'total', 'unidade'].sort());
    const tiposLinha = resultado.linhas.map((l) => l.linha.tipo);
    expect(tiposLinha.filter((t) => t === 'item')).toHaveLength(9);
    expect(tiposLinha.filter((t) => t === 'titulo')).toHaveLength(3);
    expect(tiposLinha.filter((t) => t === 'total')).toHaveLength(1);
    expect(tiposLinha.filter((t) => t === 'nao_reconhecida')).toHaveLength(0);
  });

  it('item correto não gera correção', () => {
    expect(div('1.1').status).toBe('ok');
    expect(div('1.1').correcoes).toEqual([]);
  });

  it('preço divergente: corrige e recalcula PU c/ BDI e total', () => {
    expect(tipos('1.2')).toEqual(['preco_bdi_recalculado:recalculado', 'preco_divergente:corrigido', 'total_recalculado:recalculado']);
    expect(div('1.2').final).toMatchObject({ precoUnit: 41.83, precoUnitBdi: 52.29, total: 1830.15 });
  });

  it('total da linha incorreto', () => {
    expect(tipos('2.1')).toEqual(['total_linha_incorreto:corrigido']);
    expect(div('2.1').final.total).toBe(3471.13);
  });

  it('BDI aplicado incorretamente + total recalculado', () => {
    expect(tipos('2.2')).toEqual(['bdi_incorreto:corrigido', 'total_recalculado:recalculado']);
    expect(div('2.2').final).toMatchObject({ precoUnitBdi: 98.28, total: 24570 });
  });

  it('código inexistente vai para revisão', () => {
    expect(tipos('2.3')).toEqual(['codigo_inexistente:revisao']);
    expect(div('2.3').status).toBe('revisao');
  });

  it('descrição resumida é corrigida, unidade errada é corrigida', () => {
    expect(tipos('3.1')).toEqual(['descricao_divergente:corrigido']);
    expect(tipos('3.2')).toEqual(['unidade_divergente:corrigido']);
    expect(div('3.2').final.unidade).toBe('M2');
  });

  it('descrição de outro serviço: revisão e preço NÃO corrigido', () => {
    expect(tipos('3.3')).toEqual(['possivel_codigo_errado:revisao']);
    expect(div('3.3').final.precoUnit).toBe(900);
  });

  it('cotação fica sem referência', () => {
    expect(div('3.4').status).toBe('sem_referencia');
  });

  it('somatórios: etapas recalculadas/corrigidas e total geral corrigido', () => {
    const titulos = resultado.linhas.filter((l) => l.linha.tipo === 'titulo');
    expect(titulos.map((t) => t.correcoes.map((c) => c.tipo))).toEqual([['somatorio_recalculado'], ['somatorio_recalculado'], ['somatorio_incorreto']]);
    expect(titulos.map((t) => t.final.total)).toEqual([2005.35, 28166.13, 15903]);
    const total = resultado.linhas.find((l) => l.linha.tipo === 'total')!;
    expect(total.correcoes[0].tipo).toBe('somatorio_incorreto');
    expect(total.final.total).toBe(46074.48);
    expect(resultado.resumo).toMatchObject({ itens: 9, ok: 1, corrigidos: 5, revisao: 2, semRef: 1, totalOriginal: 37518.95, totalCorrigido: 46074.48 });
  });

  it('BDI de 25% dentro da faixa TCU de edificações não gera aviso', () => {
    expect(resultado.correcoes.filter((c) => c.tipo === 'bdi_fora_faixa')).toHaveLength(0);
  });
});

describe('Excel corrigido', () => {
  let ws: ExcelJS.Worksheet;
  let wb: ExcelJS.Workbook;
  beforeAll(async () => {
    const out = await gerarExcelCorrigido(bytes, resultado);
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out.buffer as ArrayBuffer);
    ws = wb.getWorksheet('Orçamento')!;
  });

  const argb = (addr: string) => (ws.getCell(addr).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
  const nota = (addr: string) => {
    const n = ws.getCell(addr).note;
    return typeof n === 'string' ? n : n?.texts?.map((t) => t.text).join('') ?? '';
  };

  it('valor corrigido em vermelho com nota mostrando o original', () => {
    const r = linhaDoItem('1.2');
    expect(ws.getCell(`G${r}`).value).toBe(41.83);
    expect(argb(`G${r}`)).toBe('FF' + CORES.corrigido.hex);
    expect(nota(`G${r}`)).toContain('Original: R$ 45,00 -> corrigido: R$ 41,83');
    expect(nota(`G${r}`)).toContain('SINAPI-BA 08/2026 – não desonerado');
  });

  it('fórmula mantida em célula recalculada (amarelo)', () => {
    const r = linhaDoItem('1.2');
    expect(ws.getCell(`I${r}`).formula).toBe(`ROUND(F${r}*H${r},2)`);
    expect(ws.getCell(`I${r}`).result).toBe(1830.15);
    expect(argb(`I${r}`)).toBe('FF' + CORES.recalculado.hex);
  });

  it('revisão em laranja sem alterar valor', () => {
    const r = linhaDoItem('3.3');
    expect(argb(`D${r}`)).toBe('FF' + CORES.revisao.hex);
    expect(ws.getCell(`G${r}`).value).toBe(900);
    expect(ws.getCell(`D${r}`).value).toMatch(/ESCAVAÇÃO/);
  });

  it('linha correta permanece sem marcação', () => {
    const r = linhaDoItem('1.1');
    for (const col of 'ABCDEFGHI') expect(argb(`${col}${r}`)).toBeUndefined();
  });

  it('cria aba de correções com resumo e mantém o original intacto', async () => {
    const aba = wb.getWorksheet('Correções SINAPI')!;
    expect(aba).toBeDefined();
    const textos: string[] = [];
    aba.eachRow((row) => textos.push(row.values!.toString()));
    expect(textos.join('\n')).toContain('Valor total corrigido');
    expect(textos.join('\n')).toContain('Código inexistente no SINAPI');
    // o arquivo original não foi alterado
    const orig = new ExcelJS.Workbook();
    await orig.xlsx.load(bytes);
    expect(orig.getWorksheet('Orçamento')!.getCell(`G${linhaDoItem('1.2')}`).value).toBe(45);
  });

  it('gera Excel a partir da tabela extraída', async () => {
    const out = await gerarExcelDeTabela(resultado);
    const w = new ExcelJS.Workbook();
    await w.xlsx.load(out.buffer as ArrayBuffer);
    expect(w.getWorksheet('Orçamento corrigido')!.rowCount).toBeGreaterThan(10);
  });
});
