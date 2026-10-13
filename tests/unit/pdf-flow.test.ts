import { PDFArray, PDFDocument, PDFName } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONFIG_PADRAO, type Resultado } from '../../src/domain/types';
import { lerDocumento, montarOrcamento, prepararAutomatico } from '../../src/extract';
import { gerarExcelDeTabela } from '../../src/output/excel';
import { gerarPdfAnotado } from '../../src/output/pdf';
import { gerarRelatorioPdf } from '../../src/output/report';
import { verificar } from '../../src/verify/engine';
import { COMPOSICOES } from '../fixtures/generate';
import { orcamentoPdf } from '../fixtures/generate-pdf';
import { tabelaTeste } from './helpers';

let resultado: Resultado;
let bytes: ArrayBuffer;
const div = (item: string) => resultado.linhas.find((l) => l.linha.valores.itemNum === item)!;
const tipos = (item: string) => div(item).correcoes.map((c) => `${c.tipo}:${c.marca}`).sort();

beforeAll(async () => {
  bytes = await orcamentoPdf({ linhasPorPagina: 7 });
  const doc = await lerDocumento('orcamento.pdf', bytes);
  expect(doc.source).toBe('pdf');
  expect(doc.ocr).toBe(false);
  const prep = prepararAutomatico(doc);
  expect(prep.meta).toMatchObject({ dataBase: '2026-08', regime: 'nao_desonerado', bdi: 0.25 });
  expect(prep.mapeamento).toBeDefined();
  const orc = montarOrcamento(doc, doc.grids[0], prep.mapeamento!, prep.meta);
  resultado = verificar(orc, tabelaTeste(), { dataBase: '2026-08', regime: 'nao_desonerado', bdi: 0.25 }, CONFIG_PADRAO);
});

describe('fluxo PDF com texto', () => {
  it('reconstrói a tabela: 9 itens, 3 títulos, total geral; cabeçalho repetido ignorado', () => {
    const t = resultado.linhas.map((l) => l.linha.tipo);
    expect(t.filter((x) => x === 'item')).toHaveLength(9);
    expect(t.filter((x) => x === 'titulo')).toHaveLength(3);
    expect(t.filter((x) => x === 'total')).toHaveLength(1);
    expect(t.filter((x) => x === 'nao_reconhecida')).toHaveLength(0);
  });

  it('junta descrições quebradas em várias linhas', () => {
    expect(div('1.1').linha.valores.descricao).toBe(COMPOSICOES[0].descricao);
    expect(div('2.2').linha.valores.descricao).toBe(COMPOSICOES[4].descricao);
  });

  it('encontra os mesmos erros que no Excel', () => {
    expect(div('1.1').correcoes).toEqual([]);
    expect(tipos('1.2')).toEqual(['preco_bdi_recalculado:recalculado', 'preco_divergente:corrigido', 'total_recalculado:recalculado']);
    expect(tipos('2.1')).toEqual(['total_linha_incorreto:corrigido']);
    expect(tipos('2.2')).toEqual(['bdi_incorreto:corrigido', 'total_recalculado:recalculado']);
    expect(tipos('2.3')).toEqual(['codigo_inexistente:revisao']);
    expect(tipos('3.1')).toEqual(['descricao_divergente:corrigido']);
    expect(tipos('3.2')).toEqual(['unidade_divergente:corrigido']);
    expect(tipos('3.3')).toEqual(['possivel_codigo_errado:revisao']);
    expect(div('3.4').status).toBe('sem_referencia');
    expect(resultado.resumo).toMatchObject({ itens: 9, corrigidos: 5, totalOriginal: 37518.95, totalCorrigido: 46074.48 });
  });

  it('localiza cada correção na página e na posição do valor', () => {
    const c = div('1.2').correcoes.find((x) => x.tipo === 'preco_divergente')!;
    expect(c.loc).toMatchObject({ kind: 'pdf', page: 1 });
    const total = resultado.linhas.find((l) => l.linha.tipo === 'total')!;
    expect(total.correcoes[0].loc).toMatchObject({ kind: 'pdf', page: 2 });
  });
});

describe('saídas para PDF', () => {
  it('PDF anotado: uma anotação por posição marcada + páginas com a lista', async () => {
    const tamanhoOriginal = bytes.byteLength;
    const out = await gerarPdfAnotado(bytes, resultado);
    const orig = await PDFDocument.load(bytes);
    const pdf = await PDFDocument.load(out);
    expect(pdf.getPageCount()).toBeGreaterThan(orig.getPageCount());
    const annots = pdf.getPages().slice(0, orig.getPageCount()).flatMap((p) => {
      const a = p.node.lookup(PDFName.of('Annots'));
      return a instanceof PDFArray ? a.asArray() : [];
    });
    const posicoes = new Set(resultado.correcoes.filter((c) => c.loc?.kind === 'pdf').map((c) => JSON.stringify(c.loc)));
    expect(annots.length).toBe(posicoes.size);
    expect(bytes.byteLength).toBe(tamanhoOriginal); // original intacto
  });

  it('Excel corrigido a partir da tabela e relatório PDF', async () => {
    expect((await gerarExcelDeTabela(resultado)).byteLength).toBeGreaterThan(1000);
    const rel = await gerarRelatorioPdf(resultado);
    expect(new TextDecoder().decode(rel.slice(0, 4))).toBe('%PDF');
  });
});
