import type { SupabaseClient } from '@supabase/supabase-js';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { excluirVerificacao, listarVerificacoes, type VerificacaoRegistro } from '../backend/repo';
import { formatBRL } from '../domain/numbers';
import { CAMPO_LABEL, formatDataBase, REGIME_LABEL, TIPO_DIV_LABEL, type Resultado } from '../domain/types';
import { formatarValor, MARCA_LABEL, nomeSaida } from '../output/common';
import { baixar } from '../output';

/** Reconstrói um Resultado mínimo a partir do registro, para gerar o relatório novamente. */
function resultadoDoRegistro(v: VerificacaoRegistro): Resultado {
  return {
    linhas: [],
    correcoes: v.correcoes,
    resumo: v.resumo,
    mapeamento: { headerRow: 0, colunas: {} },
    contexto: {
      arquivo: v.arquivo, dataBase: v.data_base, regime: v.regime, bdi: v.bdi ?? undefined,
      verificadoEm: v.criado_em, ocr: v.ocr, tolerancia: 0.01,
    },
  };
}

export function HistoricoTab({ sb, admin }: { sb: SupabaseClient; admin: boolean }) {
  const [lista, setLista] = useState<VerificacaoRegistro[]>();
  const [aberto, setAberto] = useState<string>();
  const [erro, setErro] = useState<string>();
  const [confirmar, setConfirmar] = useState<string>();

  const recarregar = useCallback(() => {
    listarVerificacoes(sb, 200).then(setLista).catch((e: Error) => setErro(e.message));
  }, [sb]);
  useEffect(recarregar, [recarregar]);

  async function relatorio(v: VerificacaoRegistro) {
    const { gerarRelatorioExcel } = await import('../output/report');
    baixar(await gerarRelatorioExcel(resultadoDoRegistro(v)), nomeSaida(v.arquivo, 'relatorio', 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  async function excluir(id: string) {
    try {
      await excluirVerificacao(sb, id);
      setConfirmar(undefined);
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <section className="card">
      <h2>Histórico de verificações</h2>
      <p className="muted small">{admin ? 'Verificações de todos os usuários.' : 'Suas verificações.'} O conteúdo dos documentos não é armazenado — só o resultado.</p>
      {erro && <div className="alerta erro">{erro}</div>}
      {!lista ? <p className="muted">Carregando…</p> : (
        <div className="tabela-wrap">
          <table data-testid="historico">
            <thead>
              <tr>
                <th>Data</th>{admin && <th>Usuário</th>}<th>Arquivo</th><th>Referência</th><th>Itens</th><th>Corrigidos</th><th>Revisão</th><th>Total original → corrigido</th><th />
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => (
                <Fragment key={v.id}>
                  <tr>
                    <td className="small">{new Date(v.criado_em).toLocaleString('pt-BR')}</td>
                    {admin && <td className="small">{v.perfis?.email ?? '—'}</td>}
                    <td>{v.arquivo}</td>
                    <td className="small">{formatDataBase(v.data_base)} – {REGIME_LABEL[v.regime]}</td>
                    <td className="num">{v.resumo.itens}</td>
                    <td className="num">{v.resumo.corrigidos}</td>
                    <td className="num">{v.resumo.revisao}</td>
                    <td className="num small">{formatBRL(v.resumo.totalOriginal)} → {formatBRL(v.resumo.totalCorrigido)}</td>
                    <td>
                      <span className="row">
                        <button className="btn" onClick={() => setAberto(aberto === v.id ? undefined : v.id)}>{aberto === v.id ? 'Fechar' : 'Detalhes'}</button>
                        <button className="btn" onClick={() => relatorio(v)}>Relatório</button>
                        {admin && (confirmar === v.id
                          ? <button className="btn perigo" onClick={() => excluir(v.id)}>Confirmar</button>
                          : <button className="btn perigo" onClick={() => setConfirmar(v.id)}>Excluir</button>)}
                      </span>
                    </td>
                  </tr>
                  {aberto === v.id && (
                    <tr>
                      <td colSpan={admin ? 9 : 8}>
                        <table>
                          <thead><tr><th>Linha</th><th>Situação</th><th>Tipo</th><th>Campo</th><th>Original</th><th>Corrigido</th><th>Motivo</th></tr></thead>
                          <tbody>
                            {v.correcoes.map((c, i) => (
                              <tr key={i}>
                                <td>{c.linha < 0 ? 'Geral' : c.linha + 1}</td>
                                <td className={`marca-${c.marca}`}>{MARCA_LABEL[c.marca]}</td>
                                <td>{TIPO_DIV_LABEL[c.tipo]}</td>
                                <td>{c.campo ? CAMPO_LABEL[c.campo] : ''}</td>
                                <td>{formatarValor(c.campo, c.original)}</td>
                                <td>{c.marca === 'corrigido' || c.marca === 'recalculado' ? formatarValor(c.campo, c.corrigido) : ''}</td>
                                <td className="small">{c.motivo}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {lista.length === 0 && <tr><td colSpan={9} className="muted">Nenhuma verificação registrada.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
