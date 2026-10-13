import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { listarTabelas, type TabelaInfo } from '../backend/repo';
import { formatNum, parseNumeroBR } from '../domain/numbers';
import {
  CAMPOS, CAMPO_LABEL, CONFIG_PADRAO, formatDataBase, TIPO_LINHA_LABEL,
  type Campo, type Config, type Documento, type Linha, type Mapeamento, type Orcamento, type Regime, type TipoLinha, type TipoObra, type Valores,
} from '../domain/types';
import { detectarMapeamento, montarOrcamento, type Preparacao } from '../extract';
import { letraColuna } from '../extract/table';
import { FAIXAS_BDI } from '../verify/bdi';

export interface DadosConferencia {
  orcamento: Orcamento;
  dataBase: string;
  regime: Regime;
  bdi?: number;
  encargos?: number;
  config: Config;
}

const CHAVE_CONFIG = 'verificador-sinapi:config';
function lerConfig(): Config {
  try {
    return { ...CONFIG_PADRAO, ...JSON.parse(localStorage.getItem(CHAVE_CONFIG) ?? '{}') };
  } catch {
    return CONFIG_PADRAO;
  }
}
function salvarConfig(c: Config) {
  try {
    localStorage.setItem(CHAVE_CONFIG, JSON.stringify(c));
  } catch {
    /* armazenamento indisponível: segue com a configuração em memória */
  }
}

const CAMPO_VALOR: Record<Campo, keyof Valores> = {
  item: 'itemNum', codigo: 'codigo', fonte: 'fonte', descricao: 'descricao', unidade: 'unidade',
  quantidade: 'quantidade', precoUnit: 'precoUnit', precoUnitBdi: 'precoUnitBdi', total: 'total',
};
const NUMERICOS: Campo[] = ['quantidade', 'precoUnit', 'precoUnitBdi', 'total'];
const POR_PAGINA = 50;

interface Props {
  sb: SupabaseClient;
  doc: Documento;
  prep: Preparacao;
  onCancelar: () => void;
  onVerificar: (d: DadosConferencia) => Promise<void>;
}

export function Conferencia({ sb, doc, prep, onCancelar, onVerificar }: Props) {
  const [tabelas, setTabelas] = useState<TabelaInfo[]>();
  const [indiceGrid, setIndiceGrid] = useState(prep.indiceGrid);
  const [mapeamento, setMapeamento] = useState<Mapeamento | undefined>(prep.mapeamento);
  const [dataBase, setDataBase] = useState(prep.meta.dataBase ?? '');
  const [regime, setRegime] = useState<Regime | ''>(prep.meta.regime ?? '');
  const [bdiTxt, setBdiTxt] = useState(prep.meta.bdi !== undefined ? formatNum(Math.round(prep.meta.bdi * 1e6) / 1e4) : '');
  const [config, setConfig] = useState<Config>(lerConfig);
  const [edicoes, setEdicoes] = useState<Record<number, Partial<Valores> & { tipo?: TipoLinha }>>({});
  const [pagina, setPagina] = useState(0);
  const [erro, setErro] = useState<string>();
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    listarTabelas(sb).then(setTabelas).catch((e: Error) => setErro(e.message));
  }, [sb]);

  const grid = doc.grids[indiceGrid];

  const trocarGrid = (i: number) => {
    setIndiceGrid(i);
    setMapeamento(detectarMapeamento(doc.grids[i]));
    setEdicoes({});
    setPagina(0);
  };

  const orcamentoBase = useMemo(
    () => (mapeamento ? montarOrcamento(doc, grid, mapeamento, prep.meta) : undefined),
    [doc, grid, mapeamento, prep.meta],
  );

  const linhas: Linha[] = useMemo(() => {
    if (!orcamentoBase) return [];
    return orcamentoBase.linhas.map((l) => {
      const e = edicoes[l.idx];
      if (!e) return l;
      const { tipo, ...valores } = e;
      return { ...l, tipo: tipo ?? l.tipo, valores: { ...l.valores, ...valores } };
    });
  }, [orcamentoBase, edicoes]);

  const cabecalho = mapeamento ? grid.rows[mapeamento.headerRow] ?? [] : [];
  const nCols = Math.max(0, ...grid.rows.slice(0, 200).map((r) => r.length));

  const setColuna = (campo: Campo, col: string) => {
    const base: Mapeamento = mapeamento ?? { headerRow: 0, colunas: {} };
    const colunas = { ...base.colunas };
    if (col === '') delete colunas[campo];
    else colunas[campo] = Number(col);
    setMapeamento({ ...base, colunas });
    setEdicoes({});
  };

  const editar = (idx: number, campo: Campo | 'tipo', valor: string) => {
    setEdicoes((ed) => {
      const atual = { ...(ed[idx] ?? {}) };
      if (campo === 'tipo') atual.tipo = valor as TipoLinha;
      else if (NUMERICOS.includes(campo)) (atual as Record<string, unknown>)[CAMPO_VALOR[campo]] = parseNumeroBR(valor);
      else (atual as Record<string, unknown>)[CAMPO_VALOR[campo]] = valor.trim() || undefined;
      return { ...ed, [idx]: atual };
    });
  };

  const bdi = bdiTxt.trim() ? parseNumeroBR(bdiTxt) : undefined;
  const tabelaExiste = !!tabelas?.some((t) => t.data_base === dataBase);
  const itens = linhas.filter((l) => l.tipo === 'item').length;
  const pendencias: string[] = [];
  if (!mapeamento) pendencias.push('defina a linha de cabeçalho e as colunas');
  else if (itens === 0) pendencias.push('nenhum item reconhecido — ajuste o mapeamento das colunas');
  if (!dataBase) pendencias.push('escolha a data-base');
  else if (tabelas && !tabelaExiste) pendencias.push(`a tabela SINAPI-BA ${formatDataBase(dataBase)} não está cadastrada (aba Tabelas SINAPI)`);
  if (!regime) pendencias.push('escolha o regime (desonerado ou não desonerado)');
  if (bdiTxt.trim() && bdi === undefined) pendencias.push('BDI inválido');

  async function verificarAgora() {
    if (!orcamentoBase || !regime || pendencias.length) return;
    setErro(undefined);
    setOcupado(true);
    salvarConfig(config);
    try {
      await onVerificar({
        orcamento: { ...orcamentoBase, linhas },
        dataBase,
        regime,
        bdi: bdi !== undefined ? bdi / 100 : undefined,
        encargos: prep.meta.encargos,
        config,
      });
    } catch (e) {
      setErro((e as Error).message);
      setOcupado(false);
    }
  }

  const paginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const visiveis = linhas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const camposVisiveis = CAMPOS.filter((c) => mapeamento?.colunas[c] !== undefined);
  const dataBases = [...new Set([...(tabelas ?? []).map((t) => t.data_base), ...(dataBase ? [dataBase] : [])])].sort().reverse();

  return (
    <>
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Conferência — {doc.arquivo}</h2>
          <button className="btn" onClick={onCancelar}>Trocar arquivo</button>
        </div>
        {doc.ocr && (
          <div className="alerta atencao">Este documento foi lido por <strong>OCR</strong> (reconhecimento de imagem). Confira os valores com atenção: linhas com leitura duvidosa vão para revisão manual em vez de serem corrigidas.</div>
        )}
        <p className="muted small">Confira os dados detectados automaticamente. Corrija o que estiver errado antes de verificar.</p>

        <h3>Referência</h3>
        <div className="grid-form">
          <label className="campo">
            Data-base SINAPI-BA
            <select data-testid="data-base" value={dataBase} onChange={(e) => setDataBase(e.target.value)}>
              <option value="">— escolha —</option>
              {dataBases.map((d) => (
                <option key={d} value={d}>{formatDataBase(d)}{tabelas?.some((t) => t.data_base === d) ? '' : ' (não cadastrada)'}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            Regime
            <select data-testid="regime" value={regime} onChange={(e) => setRegime(e.target.value as Regime)}>
              <option value="">— escolha —</option>
              <option value="nao_desonerado">Não desonerado</option>
              <option value="desonerado">Desonerado</option>
            </select>
          </label>
          <label className="campo">
            BDI (%)
            <input data-testid="bdi" value={bdiTxt} placeholder="ex.: 25,00" onChange={(e) => setBdiTxt(e.target.value)} />
          </label>
          <label className="campo">
            Tolerância (R$)
            <input type="number" step="0.01" min="0" value={config.tolerancia} onChange={(e) => setConfig({ ...config, tolerancia: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label className="campo">
            Tipo de obra (faixa de BDI do TCU)
            <select value={config.tipoObra} onChange={(e) => setConfig({ ...config, tipoObra: e.target.value as TipoObra })}>
              {Object.entries(FAIXAS_BDI).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
          </label>
          <label className="campo">
            Descrições diferentes do SINAPI
            <select value={config.corrigirDescricao ? 's' : 'n'} onChange={(e) => setConfig({ ...config, corrigirDescricao: e.target.value === 's' })}>
              <option value="s">Corrigir para a descrição oficial</option>
              <option value="n">Apenas avisar</option>
            </select>
          </label>
        </div>
        {prep.meta.encargos !== undefined && <p className="muted small">Encargos sociais informados no documento: {formatNum(prep.meta.encargos * 100)}%</p>}

        <h3>Tabela do orçamento</h3>
        <div className="grid-form">
          {doc.grids.length > 1 && (
            <label className="campo">
              {doc.source === 'xlsx' ? 'Aba da planilha' : 'Tabela'}
              <select value={indiceGrid} onChange={(e) => trocarGrid(Number(e.target.value))}>
                {doc.grids.map((g, i) => <option key={i} value={i}>{g.name}</option>)}
              </select>
            </label>
          )}
          <label className="campo">
            Linha do cabeçalho
            <input
              type="number"
              min={1}
              max={grid.rows.length}
              value={mapeamento ? mapeamento.headerRow + 1 : ''}
              onChange={(e) => {
                const r = Math.max(0, Number(e.target.value) - 1);
                setMapeamento({ headerRow: r, colunas: mapeamento?.colunas ?? {} });
                setEdicoes({});
              }}
            />
          </label>
          {CAMPOS.map((c) => (
            <label className="campo" key={c}>
              Coluna: {CAMPO_LABEL[c]}
              <select data-testid={`col-${c}`} value={mapeamento?.colunas[c] ?? ''} onChange={(e) => setColuna(c, e.target.value)}>
                <option value="">— não existe —</option>
                {Array.from({ length: nCols }, (_, i) => (
                  <option key={i} value={i}>{letraColuna(i)}{cabecalho[i]?.text ? ` — ${cabecalho[i].text.slice(0, 30)}` : ''}</option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <p className="small" data-testid="resumo-extracao">
          {linhas.length} linhas · <strong>{itens} itens</strong> · {linhas.filter((l) => l.tipo === 'titulo').length} títulos ·{' '}
          {linhas.filter((l) => l.tipo === 'subtotal' || l.tipo === 'total').length} totais ·{' '}
          {linhas.filter((l) => l.tipo === 'nao_reconhecida').length} não reconhecidas
        </p>

        {linhas.length > 0 && (
          <>
            <div className="tabela-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Tipo</th>
                    {camposVisiveis.map((c) => <th key={c}>{CAMPO_LABEL[c]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((l) => (
                    <tr key={l.idx} className={l.tipo === 'nao_reconhecida' ? 'marca-revisao' : undefined}>
                      <td className="num">{l.idx + 1}</td>
                      <td>
                        <select value={l.tipo} onChange={(e) => editar(l.idx, 'tipo', e.target.value)} aria-label={`tipo da linha ${l.idx + 1}`}>
                          {Object.entries(TIPO_LINHA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      {camposVisiveis.map((c) => {
                        const v = l.valores[CAMPO_VALOR[c]];
                        const txt = v === undefined ? '' : typeof v === 'number' ? formatNum(v) : v;
                        const conf = l.cells[c]?.confidence;
                        return (
                          <td key={c} style={{ minWidth: c === 'descricao' ? 280 : 90 }} title={conf !== undefined ? `Confiança OCR: ${Math.round(conf)}%` : undefined}>
                            <input
                              key={`${l.idx}-${c}-${txt}`}
                              defaultValue={txt}
                              onBlur={(e) => e.target.value !== txt && editar(l.idx, c, e.target.value)}
                              className={conf !== undefined && conf < config.ocrConfiancaMin ? 'marca-revisao' : undefined}
                              aria-label={`${CAMPO_LABEL[c]} da linha ${l.idx + 1}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {paginas > 1 && (
              <div className="paginacao small">
                <button className="btn" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</button>
                <span>Página {pagina + 1} de {paginas}</span>
                <button className="btn" disabled={pagina >= paginas - 1} onClick={() => setPagina(pagina + 1)}>Próxima</button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card">
        {pendencias.length > 0 && (
          <div className="alerta atencao">
            Antes de verificar: {pendencias.join('; ')}.
          </div>
        )}
        {erro && <div className="alerta erro" role="alert">{erro}</div>}
        <button className="btn primario" data-testid="verificar" disabled={pendencias.length > 0 || ocupado} onClick={verificarAgora}>
          {ocupado ? 'Verificando…' : `Verificar ${itens} itens`}
        </button>
      </section>
    </>
  );
}
