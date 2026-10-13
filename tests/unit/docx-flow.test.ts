import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG_PADRAO, type Resultado } from '../../src/domain/types';
import { lerDocumento, montarOrcamento, prepararAutomatico } from '../../src/extract';
import { lerDocx } from '../../src/extract/docx';
import { gerarDocxCorrigido } from '../../src/output/docx';
import { verificar } from '../../src/verify/engine';
import { COMPOSICOES } from '../fixtures/generate';
import { orcamentoDocx } from '../fixtures/generate-docx';
import { tabelaTeste } from './helpers';

let resultado: Resultado;
let bytes: ArrayBuffer;
const div = (item: string) => resultado.linhas.find((l) => l.linha.valores.itemNum === item)!;
const tipos = (item: string) => div(item).correcoes.map((c) => `${c.tipo}:${c.marca}`).sort();

beforeAll(async () => {
  bytes = await orcamentoDocx();
  const doc = await lerDocumento('orcamento.docx', bytes);
  expect(doc.source).toBe('docx');
  const prep = prepararAutomatico(doc);
  expect(prep.meta).toMatchObject({ dataBase: '2026-08', regime: 'nao_desonerado', bdi: 0.25 });
  const orc = montarOrcamento(doc, doc.grids[prep.indiceGrid], prep.mapeamento!, prep.meta);
  resultado = verificar(orc, tabelaTeste(), { dataBase: '2026-08', regime: 'nao_desonerado', bdi: 0.25 }, CONFIG_PADRAO);
});

describe('fluxo Word', () => {
  it('lê a tabela com células mescladas, parágrafos e runs divididos', () => {
    const t = resultado.linhas.map((l) => l.linha.tipo);
    expect(t.filter((x) => x === 'item')).toHaveLength(9);
    expect(t.filter((x) => x === 'titulo')).toHaveLength(3);
    expect(t.filter((x) => x === 'total')).toHaveLength(1);
    expect(div('1.1').linha.valores.descricao).toBe(COMPOSICOES[0].descricao);
    expect(div('1.2').linha.valores.precoUnit).toBe(45);
  });

  it('encontra os mesmos erros que no Excel e no PDF', () => {
    expect(div('1.1').correcoes).toEqual([]);
    expect(tipos('1.2')).toEqual(['preco_bdi_recalculado:recalculado', 'preco_divergente:corrigido', 'total_recalculado:recalculado']);
    expect(tipos('2.1')).toEqual(['total_linha_incorreto:corrigido']);
    expect(tipos('2.2')).toEqual(['bdi_incorreto:corrigido', 'total_recalculado:recalculado']);
    expect(tipos('3.3')).toEqual(['possivel_codigo_errado:revisao']);
    expect(resultado.resumo).toMatchObject({ itens: 9, corrigidos: 5, totalOriginal: 37518.95, totalCorrigido: 46074.48 });
  });
});

describe('Word corrigido', () => {
  let saida: Uint8Array;
  let zip: JSZip;
  let xml: string;
  beforeAll(async () => {
    saida = await gerarDocxCorrigido(bytes, resultado);
    zip = await JSZip.loadAsync(saida);
    xml = await zip.file('word/document.xml')!.async('string');
  });

  it('troca os valores mantendo o formato do texto original', async () => {
    const doc = await lerDocx('c.docx', saida.buffer as ArrayBuffer);
    const g = doc.grids[0];
    const linha = g.rows.find((r) => r[0].text === '1.2')!;
    expect(linha[6].text).toBe('R$ 41,83'); // tinha "R$ " e dois runs
    expect(linha[7].text).toBe('52,29');
    expect(linha[8].text).toBe('1.830,15');
    const total = g.rows.find((r) => r.some((c) => c.text === 'TOTAL GERAL'))!;
    expect(total[total.length - 1].text).toBe('46.074,48');
  });

  it('sombreia as células e cria comentários nativos do Word', async () => {
    expect(xml).toContain('w:fill="F8B4B4"');
    expect(xml).toContain('w:fill="FFF3A3"');
    expect(xml).toContain('w:fill="FFC98B"');
    const comments = await zip.file('word/comments.xml')!.async('string');
    const n = (comments.match(/<w:comment /g) ?? []).length;
    const refs = (xml.match(/<w:commentReference /g) ?? []).length;
    expect(n).toBeGreaterThan(5);
    expect(refs).toBe(n);
    expect(comments).toContain('Original: R$ 45,00 -&gt; corrigido: R$ 41,83');
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('/word/comments.xml');
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain('comments.xml');
  });

  it('w:shd fica antes de w:vAlign (ordem exigida pelo Word)', () => {
    const prs = xml.match(/<w:tcPr>.*?<\/w:tcPr>/g)!.filter((p) => p.includes('w:shd') && p.includes('w:vAlign'));
    expect(prs.length).toBeGreaterThan(0);
    for (const p of prs) expect(p.indexOf('w:shd')).toBeLessThan(p.indexOf('w:vAlign'));
  });

  it('acrescenta tabela de resumo ao final, antes do sectPr', async () => {
    const doc = await lerDocx('c.docx', saida.buffer as ArrayBuffer);
    expect(doc.grids).toHaveLength(2);
    expect(doc.fullText).toContain('Correções — Verificador SINAPI-BA');
    expect(xml.lastIndexOf('<w:sectPr')).toBeGreaterThan(xml.lastIndexOf('</w:tbl>'));
  });
});
