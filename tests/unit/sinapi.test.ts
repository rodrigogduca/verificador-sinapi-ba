import { describe, expect, it } from 'vitest';
import { abasPendentes, analisarSinapi, estatisticas, lerPlanilhaSinapi, mesclarSinapi } from '../../src/sinapi/importer';
import { COMPOSICOES, INSUMOS, sinapiFormatoAntigo, sinapiFormatoNovo } from '../fixtures/generate';

describe('importação SINAPI — formato antigo (.xls por regime)', () => {
  it('detecta tipo, regime, data-base e mescla os quatro arquivos', () => {
    let tabela;
    const arquivos = [
      ['SINAPI_Preco_Ref_Insumos_BA_082026_NaoDesonerado.xls', sinapiFormatoAntigo('insumo', 'nd')],
      ['SINAPI_Preco_Ref_Insumos_BA_082026_Desonerado.xls', sinapiFormatoAntigo('insumo', 'd')],
      ['SINAPI_Custo_Ref_Composicoes_Sintetico_BA_202608_NaoDesonerado.xls', sinapiFormatoAntigo('composicao', 'nd')],
      ['SINAPI_Custo_Ref_Composicoes_Sintetico_BA_202608_Desonerado.xls', sinapiFormatoAntigo('composicao', 'd')],
    ] as const;
    for (const [nome, bytes] of arquivos) {
      const previa = analisarSinapi(nome, lerPlanilhaSinapi(bytes));
      expect(previa.dataBase).toBe('2026-08');
      const aba = previa.abas[0];
      expect(aba.ignorada).toBeUndefined();
      expect(aba.tipo).toBe(nome.includes('Insumos') ? 'insumo' : 'composicao');
      expect(aba.regime).toBe(nome.includes('NaoDesonerado') ? 'nao_desonerado' : 'desonerado');
      expect(abasPendentes(previa)).toEqual([]);
      tabela = mesclarSinapi(tabela, previa, { dataBase: previa.dataBase! });
    }
    expect(tabela!.arquivos).toHaveLength(4);
    const e = tabela!.entries['composicao:96995'];
    expect(e.unidade).toBe('M3');
    expect(e.preco).toEqual({ nao_desonerado: 41.83, desonerado: 36.92 });
    expect(tabela!.entries['insumo:1379'].preco.nao_desonerado).toBe(0.79);
    expect(estatisticas(tabela!)).toEqual({ composicoes: COMPOSICOES.length, insumos: INSUMOS.length, comPrecoNaoDesonerado: 10, comPrecoDesonerado: 10 });
  });
});

describe('importação SINAPI — formato novo (todas as UFs)', () => {
  it('usa a coluna BA, ignora Menu e CSE, detecta regime pelo nome da aba', () => {
    const previa = analisarSinapi('SINAPI_Referência_2026_08.xlsx', lerPlanilhaSinapi(sinapiFormatoNovo()));
    expect(previa.dataBase).toBe('2026-08');
    const porNome = Object.fromEntries(previa.abas.map((a) => [a.nome, a]));
    expect(porNome.Menu.ignorada).toBeTruthy();
    expect(porNome.CSE.ignorada).toMatch(/sem encargos/);
    expect(porNome.ISD).toMatchObject({ tipo: 'insumo', regime: 'nao_desonerado', colunaPreco: 'BA' });
    expect(porNome.CCD).toMatchObject({ tipo: 'composicao', regime: 'desonerado', colunaPreco: 'BA' });

    const t = mesclarSinapi(undefined, previa, { dataBase: '2026-08' });
    expect(t.entries['composicao:87878'].preco).toEqual({ nao_desonerado: 4.85, desonerado: 4.41 });
    expect(t.entries['insumo:4750'].preco).toEqual({ nao_desonerado: 25.4, desonerado: 22.1 });
  });

  it('exige regime quando não dá para detectar', () => {
    const previa = analisarSinapi('tabela.xlsx', lerPlanilhaSinapi(sinapiFormatoAntigo('insumo', 'nd', 'xlsx')));
    // o regime vem do texto "ENCARGOS SOCIAIS: NÃO DESONERADO" no topo
    expect(previa.abas[0].regime).toBe('nao_desonerado');
    previa.abas[0].regime = undefined;
    expect(abasPendentes(previa)).toEqual(['Planilha1']);
    expect(() => mesclarSinapi(undefined, previa, { dataBase: '2026-08' })).toThrow(/regime/);
    const t = mesclarSinapi(undefined, previa, { dataBase: '2026-08', porAba: { Planilha1: { regime: 'desonerado' } } });
    expect(t.entries['insumo:370'].preco).toEqual({ desonerado: 98.5 });
  });
});
