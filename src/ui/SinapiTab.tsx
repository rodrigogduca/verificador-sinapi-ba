import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { carregarTabela, excluirTabela, listarTabelas, salvarTabela, type TabelaInfo } from '../backend/repo';
import { formatDataBase, REGIME_LABEL, type Regime, type TipoRef } from '../domain/types';
import { abasPendentes, analisarSinapi, estatisticas, lerPlanilhaSinapi, mesclarSinapi, type PreviaImportacao } from '../sinapi/importer';

export function SinapiTab({ sb, admin }: { sb: SupabaseClient; admin: boolean }) {
  const [tabelas, setTabelas] = useState<TabelaInfo[]>([]);
  const [previas, setPrevias] = useState<PreviaImportacao[]>([]);
  const [dataBase, setDataBase] = useState('');
  const [ajustes, setAjustes] = useState<Record<string, { regime?: Regime; tipo?: TipoRef }>>({});
  const [erro, setErro] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const [progresso, setProgresso] = useState<number>();
  const [confirmarExclusao, setConfirmarExclusao] = useState<string>();

  const recarregar = useCallback(() => {
    listarTabelas(sb).then(setTabelas).catch((e: Error) => setErro(e.message));
  }, [sb]);
  useEffect(recarregar, [recarregar]);

  async function lerArquivos(files: FileList) {
    setErro(undefined);
    setMsg(undefined);
    const novas: PreviaImportacao[] = [];
    for (const f of Array.from(files)) {
      try {
        if (f.size > 100 * 1024 * 1024) throw new Error('arquivo maior que 100 MB');
        novas.push(analisarSinapi(f.name, lerPlanilhaSinapi(await f.arrayBuffer())));
      } catch (e) {
        setErro(`Não foi possível ler "${f.name}": ${(e as Error).message}`);
      }
    }
    setPrevias(novas);
    setAjustes({});
    setDataBase(novas.find((p) => p.dataBase)?.dataBase ?? '');
  }

  const chave = (arq: string, aba: string) => `${arq}::${aba}`;
  const pendentes = previas.flatMap((p) =>
    abasPendentes(p, { dataBase, porAba: Object.fromEntries(p.abas.map((a) => [a.nome, ajustes[chave(p.arquivo, a.nome)] ?? {}])) }).map((a) => `${p.arquivo} / ${a}`),
  );
  const totalItens = previas.reduce((n, p) => n + p.abas.filter((a) => !a.ignorada).reduce((m, a) => m + a.entradas.length, 0), 0);
  const dataBaseValida = /^\d{4}-(0[1-9]|1[0-2])$/.test(dataBase);

  async function salvar() {
    setErro(undefined);
    setMsg(undefined);
    try {
      setProgresso(0);
      let tabela = await carregarTabela(sb, dataBase);
      for (const p of previas) {
        const porAba = Object.fromEntries(p.abas.map((a) => [a.nome, ajustes[chave(p.arquivo, a.nome)] ?? {}]));
        tabela = mesclarSinapi(tabela, p, { dataBase, porAba });
      }
      await salvarTabela(sb, tabela!, setProgresso);
      const st = estatisticas(tabela!);
      setMsg(`Tabela SINAPI-BA ${formatDataBase(dataBase)} salva: ${st.composicoes} composições e ${st.insumos} insumos (${st.comPrecoNaoDesonerado} com preço não desonerado, ${st.comPrecoDesonerado} com preço desonerado).`);
      setPrevias([]);
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setProgresso(undefined);
    }
  }

  async function excluir(db: string) {
    setErro(undefined);
    try {
      await excluirTabela(sb, db);
      setConfirmarExclusao(undefined);
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <>
      {admin && (
        <section className="card">
          <h2>Importar tabela SINAPI-BA</h2>
          <p className="muted small">
            Baixe as planilhas de preços do SINAPI no site da Caixa (Bahia; insumos e composições; desonerado e não desonerado) e selecione todos os arquivos do mesmo mês.
            Funciona com o formato antigo (um arquivo por regime) e com o formato novo (todas as UFs em um arquivo).
          </p>
          <input data-testid="arquivo-sinapi" type="file" multiple accept=".xls,.xlsx,.xlsm" onChange={(e) => e.target.files && lerArquivos(e.target.files)} />

          {previas.length > 0 && (
            <>
              <div className="grid-form" style={{ marginTop: 12 }}>
                <label className="campo">
                  Data-base (mês/ano)
                  <input data-testid="sinapi-data-base" type="month" value={dataBase} onChange={(e) => setDataBase(e.target.value)} />
                </label>
              </div>
              <div className="tabela-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr><th>Arquivo</th><th>Aba</th><th>Tipo</th><th>Regime</th><th>Coluna de preço</th><th>Itens</th><th>Situação</th></tr>
                  </thead>
                  <tbody>
                    {previas.flatMap((p) =>
                      p.abas.map((a) => {
                        const aj = ajustes[chave(p.arquivo, a.nome)] ?? {};
                        const set = (v: { regime?: Regime; tipo?: TipoRef }) => setAjustes({ ...ajustes, [chave(p.arquivo, a.nome)]: { ...aj, ...v } });
                        return (
                          <tr key={chave(p.arquivo, a.nome)}>
                            <td>{p.arquivo}</td>
                            <td>{a.nome}</td>
                            <td>
                              {a.ignorada ? '—' : (
                                <select value={aj.tipo ?? a.tipo ?? ''} onChange={(e) => set({ tipo: e.target.value as TipoRef })}>
                                  <option value="">— escolha —</option>
                                  <option value="composicao">Composição</option>
                                  <option value="insumo">Insumo</option>
                                </select>
                              )}
                            </td>
                            <td>
                              {a.ignorada ? '—' : (
                                <select value={aj.regime ?? a.regime ?? ''} onChange={(e) => set({ regime: e.target.value as Regime })}>
                                  <option value="">— escolha —</option>
                                  {(Object.keys(REGIME_LABEL) as Regime[]).map((r) => <option key={r} value={r}>{REGIME_LABEL[r]}</option>)}
                                </select>
                              )}
                            </td>
                            <td>{a.colunaPreco ?? '—'}</td>
                            <td className="num">{a.ignorada ? '—' : a.entradas.length}</td>
                            <td className="small">{a.ignorada ? `ignorada: ${a.ignorada}` : 'ok'}</td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
              {pendentes.length > 0 && <div className="alerta atencao">Informe tipo e regime de: {pendentes.join(', ')}.</div>}
              {totalItens === 0 && <div className="alerta erro">Nenhum item SINAPI encontrado nos arquivos.</div>}
              {progresso !== undefined && (
                <div className="progresso" style={{ margin: '10px 0' }}><div style={{ width: `${Math.round(progresso * 100)}%` }} /></div>
              )}
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="btn primario"
                  data-testid="salvar-sinapi"
                  disabled={!dataBaseValida || pendentes.length > 0 || totalItens === 0 || progresso !== undefined}
                  onClick={salvar}
                >
                  Salvar {totalItens} itens em SINAPI-BA {dataBaseValida ? formatDataBase(dataBase) : ''}
                </button>
                {tabelas.some((t) => t.data_base === dataBase) && (
                  <span className="small muted">Já existe tabela deste mês: os itens serão atualizados/acrescentados.</span>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {erro && <div className="alerta erro" role="alert">{erro}</div>}
      {msg && <div className="alerta ok" data-testid="sinapi-msg">{msg}</div>}

      <section className="card">
        <h2>Tabelas cadastradas</h2>
        {!admin && <p className="muted small">Somente administradores importam ou excluem tabelas.</p>}
        <div className="tabela-wrap">
          <table data-testid="tabelas-sinapi">
            <thead>
              <tr><th>Data-base</th><th>Arquivos de origem</th><th>Importada em</th>{admin && <th />}</tr>
            </thead>
            <tbody>
              {tabelas.map((t) => (
                <tr key={t.data_base}>
                  <td><strong>{formatDataBase(t.data_base)}</strong></td>
                  <td className="small">{t.arquivos.join(', ')}</td>
                  <td className="small">{new Date(t.importado_em).toLocaleString('pt-BR')}</td>
                  {admin && (
                    <td>
                      {confirmarExclusao === t.data_base ? (
                        <span className="row">
                          <button className="btn perigo" onClick={() => excluir(t.data_base)}>Confirmar exclusão</button>
                          <button className="btn" onClick={() => setConfirmarExclusao(undefined)}>Cancelar</button>
                        </span>
                      ) : (
                        <button className="btn perigo" onClick={() => setConfirmarExclusao(t.data_base)}>Excluir</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {tabelas.length === 0 && <tr><td colSpan={4} className="muted">Nenhuma tabela cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
