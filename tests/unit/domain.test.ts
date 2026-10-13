import { describe, expect, it } from 'vitest';
import { formatBRL, parseNumeroBR, round2, somar } from '../../src/domain/numbers';
import { contencao, mesmaUnidade, normalizarCodigo, similaridade } from '../../src/domain/text';
import { extrairMetadados } from '../../src/extract/metadata';
import { campoDoCabecalho } from '../../src/extract/table';

describe('parseNumeroBR', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['R$ 1.234,56', 1234.56],
    ['1234.56', 1234.56],
    ['1234,5', 1234.5],
    ['(1.234,56)', -1234.56],
    ['-12,30', -12.3],
    ['1.500', 1500],
    ['0.125', 0.125],
    ['12,5%', 12.5],
    ['1,234,567.89', 1234567.89],
    [' 7 ', 7],
  ])('%s → %d', (s, n) => expect(parseNumeroBR(s)).toBeCloseTo(n, 6));

  it.each(['', 'abc', 'R$', '12a', '1.1.1a'])('"%s" não é número', (s) => expect(parseNumeroBR(s)).toBeUndefined());
});

describe('round2 / somar', () => {
  it('arredonda meio para cima sem erro de ponto flutuante', () => {
    expect(round2(277.6875)).toBe(277.69);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(52.2875)).toBe(52.29);
    expect(round2(-2.345)).toBe(-2.35);
  });
  it('soma em centavos', () => expect(somar([0.1, 0.2, 0.3])).toBe(0.6));
  it('formata em reais', () => expect(formatBRL(1234.5)).toBe('R$ 1.234,50'));
});

describe('texto', () => {
  it('unidades equivalentes', () => {
    expect(mesmaUnidade('m²', 'M2')).toBe(true);
    expect(mesmaUnidade('und', 'UN')).toBe(true);
    expect(mesmaUnidade('m³', 'm3')).toBe(true);
    expect(mesmaUnidade('m', 'M2')).toBe(false);
    expect(mesmaUnidade('hr', 'H')).toBe(true);
  });
  it('códigos', () => {
    expect(normalizarCodigo('00001379')).toBe('1379');
    expect(normalizarCodigo('SINAPI 87878')).toBe('87878');
    expect(normalizarCodigo('COT-01')).toBeUndefined();
    expect(normalizarCodigo('1.1')).toBeUndefined();
  });
  it('similaridade de descrição resumida é alta, de outro serviço é baixa', () => {
    const ref = 'CHAPISCO APLICADO EM ALVENARIA (SEM PRESENÇA DE VÃOS) E ESTRUTURAS DE CONCRETO DE FACHADA, COM COLHER DE PEDREIRO. ARGAMASSA TRAÇO 1:3 COM PREPARO EM BETONEIRA 400L. AF_10/2022';
    expect(similaridade('Chapisco aplicado em alvenaria e estruturas de concreto de fachada, com colher de pedreiro', ref)).toBeGreaterThan(0.8);
    expect(contencao('chapisco aplic. em alven.', ref)).toBe(1);
    expect(similaridade('ESCAVAÇÃO MANUAL DE VALA EM SOLO DE 1ª CATEGORIA', ref)).toBeLessThan(0.5);
  });
});

describe('cabeçalhos', () => {
  it.each([
    ['Item', 'item'],
    ['Código SINAPI', 'codigo'],
    ['Cód.', 'codigo'],
    ['Fonte', 'fonte'],
    ['Descrição dos Serviços', 'descricao'],
    ['Unid.', 'unidade'],
    ['Und', 'unidade'],
    ['Quant.', 'quantidade'],
    ['Preço Unitário (R$)', 'precoUnit'],
    ['Custo Unit. s/ BDI', 'precoUnit'],
    ['Preço Unit. c/ BDI (R$)', 'precoUnitBdi'],
    ['Valor com BDI', 'precoUnitBdi'],
    ['Preço Total', 'total'],
    ['BDI (%)', undefined],
  ])('%s → %s', (h, campo) => expect(campoDoCabecalho(h)).toBe(campo));
});

describe('metadados', () => {
  it('extrai data-base, regime, BDI e encargos', () => {
    const m = extrairMetadados('Orçamento\nReferência: SINAPI-BA 08/2026 - Não desonerado\nBDI: 25,00%\nEncargos sociais: 113,12%');
    expect(m).toEqual({ dataBase: '2026-08', regime: 'nao_desonerado', bdi: 0.25, encargos: 1.1312 });
  });
  it('data-base por extenso e regime desonerado', () => {
    const m = extrairMetadados('Tabela SINAPI agosto/2026 (desonerada) — BDI 22,12 %');
    expect(m.dataBase).toBe('2026-08');
    expect(m.regime).toBe('desonerado');
    expect(m.bdi).toBeCloseTo(0.2212);
  });
});
