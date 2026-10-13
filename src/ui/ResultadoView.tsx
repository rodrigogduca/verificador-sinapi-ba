import { useMemo, useState } from 'react';
import { formatBRL } from '../domain/numbers';
import { CAMPO_LABEL, TIPO_DIV_LABEL, type Documento, type Marca, type Resultado, type TipoDiv } from '../domain/types';
import { descreverLoc, formatarValor, MARCA_LABEL, rotuloReferencia } from '../output/common';
import { baixar, saidasDisponiveis } from '../output';

interface Props {
  doc: Documento;
  resultado: Resultado;
  avisoHistorico?: string;
  onNova: () => void;
}

export function ResultadoView({ doc, resultado: r, avisoHistorico, onNova }: Props) {
  const [filtroMarca, setFiltroMarca] = useState<Marca | ''>('');
  const [filtroTipo, setFiltroTipo] = useState<TipoDiv | ''>('');
  const [gerando, setGerando] = useState<string>();
  const [erro, setErro] = useState<string>();
  const saidas = useMemo(() => saidasDisponiveis(doc, r), [doc, r]);
  const s = r.resumo;

  const lista = r.correcoes.filter((c) => (!filtroMarca || c.marca === filtroMarca) && (!filtroTipo || c.tipo === filtroTipo));
  const item = (linha: number) => {
    const l = r.linhas.find((x) => x.linha.idx === linha);
    return l?.linha.valores.itemNum ?? l?.linha.valores.codigo ?? '';
  };

  async function gerar(id: string) {
    const saida = saidas.find((x) => x.id === id)!;
    setErro(undefined);
    setGerando(id);
    try {
      baixar(await saida.gerar(), saida.nome, saida.mime);
    } catch (e) {
      setErro(`Erro ao gerar "${saida.rotulo}": ${(e as Error).message}`);
    } finally {
      setGerando(undefined);
    }
  }

  const kpis: [string, string | number, string?][] = [
    ['Itens', s.itens],
    ['OK', s.ok],
    ['Corrigidos', s.corrigidos, 'marca-corrigido'],
    ['Revisão manual', s.revisao, 'marca-revisao'],
    ['Sem referência', s.semRef],
    ['Avisos', s.avisos, 'marca-aviso'],
    ['Total original', formatBRL(s.totalOriginal)],
    ['Total corrigido', formatBRL(s.totalCorrigido)],
  ];

  return (
    <>
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Resultado — {r.contexto.arquivo}</h2>
          <button className="btn" onClick={onNova}>Nova verificação</button>
        </div>
        <p className="muted small">{rotuloReferencia(r)}{r.contexto.bdi !== undefined ? ` · BDI ${(r.contexto.bdi * 100).toFixed(2).replace('.', ',')}%` : ''}{r.contexto.ocr ? ' · lido por OCR' : ''}</p>
        {avisoHistorico && <div className="alerta atencao">{avisoHistorico}</div>}
        <div className="cards" data-testid="resumo">
          {kpis.map(([l, v, cls]) => (
            <div key={l} className={`kpi ${cls ?? ''}`} data-testid={`kpi-${l}`}>
              <div className="v">{v}</div>
              <div className="l">{l}</div>
            </div>
          ))}
        </div>
        <h3>Baixar</h3>
        <div className="downloads">
          {saidas.map((x) => (
            <div className="card" key={x.id}>
              <button className="btn primario" data-testid={`baixar-${x.id}`} disabled={!!gerando} onClick={() => gerar(x.id)}>
                {gerando === x.id ? 'Gerando…' : x.rotulo}
              </button>
              <p className="muted small" style={{ margin: '6px 0 0' }}>{x.descricao}</p>
            </div>
          ))}
        </div>
        {erro && <div className="alerta erro" role="alert">{erro}</div>}
        <p className="small" style={{ marginTop: 12 }}>
          Legenda: <span className="chip marca-corrigido">corrigido</span> <span className="chip marca-recalculado">recalculado por consequência</span>{' '}
          <span className="chip marca-revisao">revisão manual</span> <span className="chip marca-aviso">aviso</span>
        </p>
      </section>

      <section className="card">
        <h2>Divergências ({lista.length})</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <label className="campo">
            Situação
            <select value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value as Marca | '')}>
              <option value="">Todas</option>
              {(Object.keys(MARCA_LABEL) as Marca[]).map((m) => <option key={m} value={m}>{MARCA_LABEL[m]}</option>)}
            </select>
          </label>
          <label className="campo">
            Tipo
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as TipoDiv | '')}>
              <option value="">Todos</option>
              {(Object.keys(s.porTipo) as TipoDiv[]).map((t) => <option key={t} value={t}>{TIPO_DIV_LABEL[t]} ({s.porTipo[t]})</option>)}
            </select>
          </label>
        </div>
        <div className="tabela-wrap">
          <table data-testid="divergencias">
            <thead>
              <tr>
                <th>Local</th><th>Item</th><th>Situação</th><th>Tipo</th><th>Campo</th><th>Original</th><th>Corrigido</th><th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c, i) => (
                <tr key={i}>
                  <td>{c.linha < 0 ? 'Geral' : descreverLoc(c.loc)}</td>
                  <td>{c.linha < 0 ? '' : item(c.linha)}</td>
                  <td className={`marca-${c.marca}`}>{MARCA_LABEL[c.marca]}</td>
                  <td>{TIPO_DIV_LABEL[c.tipo]}</td>
                  <td>{c.campo ? CAMPO_LABEL[c.campo] : ''}</td>
                  <td>{formatarValor(c.campo, c.original)}</td>
                  <td>{c.marca === 'corrigido' || c.marca === 'recalculado' ? formatarValor(c.campo, c.corrigido) : ''}</td>
                  <td>{c.motivo}</td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr><td colSpan={8} className="muted">Nenhuma divergência{filtroMarca || filtroTipo ? ' com esse filtro' : ''}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
