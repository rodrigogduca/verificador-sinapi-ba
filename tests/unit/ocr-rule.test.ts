// Regra de baixa confiança do OCR (R9.5): linha com leitura duvidosa vai para revisão, sem correção.
import { describe, expect, it } from 'vitest';
import { CONFIG_PADRAO, type Cell, type Grid, type Orcamento } from '../../src/domain/types';
import { detectarMapeamento, extrairLinhas } from '../../src/extract/table';
import { verificar } from '../../src/verify/engine';
import { tabelaTeste } from './helpers';

const c = (text: string, confidence = 95): Cell => ({ text, confidence, loc: { kind: 'pdf', page: 1, bbox: [0, 0, 1, 1] } });

function orcamento(confPreco: number): Orcamento {
  const rows: Cell[][] = [
    ['Item', 'Código', 'Descrição', 'Und', 'Quant.', 'Preço Unit.', 'Total'].map((t) => c(t)),
    [c('1.1'), c('96995'), c('REATERRO MANUAL APILOADO COM SOQUETE. AF_10/2017'), c('M3'), c('10,00'), c('45,00', confPreco), c('450,00')],
  ].map((r) => r.map((x) => ({ ...x, num: Number(x.text.replace('.', '').replace(',', '.')) || undefined })));
  const grid: Grid = { name: 'ocr', rows, source: 'ocr' };
  const mapeamento = detectarMapeamento(grid)!;
  return { arquivo: 'x.png', grid, mapeamento, linhas: extrairLinhas(grid, mapeamento), meta: {}, ocr: true };
}

describe('OCR: confiança mínima', () => {
  it('leitura confiável: corrige normalmente', () => {
    const r = verificar(orcamento(92), tabelaTeste(), { dataBase: '2026-08', regime: 'nao_desonerado' }, CONFIG_PADRAO);
    expect(r.linhas[0].correcoes.map((x) => x.tipo)).toContain('preco_divergente');
    expect(r.linhas[0].final.precoUnit).toBe(41.83);
  });

  it('leitura duvidosa: revisão manual, valor não é alterado', () => {
    const r = verificar(orcamento(40), tabelaTeste(), { dataBase: '2026-08', regime: 'nao_desonerado' }, CONFIG_PADRAO);
    expect(r.linhas[0].correcoes.map((x) => `${x.tipo}:${x.marca}`)).toEqual(['ocr_baixa_confianca:revisao']);
    expect(r.linhas[0].final.precoUnit).toBe(45);
    expect(r.contexto.ocr).toBe(true);
  });
});
