import type { SupabaseClient } from '@supabase/supabase-js';
import { useRef, useState, type DragEvent } from 'react';
import { carregarTabela, registrarVerificacao } from '../backend/repo';
import type { Documento, Resultado } from '../domain/types';
import { FORMATOS_ACEITOS, lerDocumento, prepararAutomatico, tipoDoArquivo, type Preparacao } from '../extract';
import { verificar } from '../verify/engine';
import { Conferencia, type DadosConferencia } from './Conferencia';
import { ResultadoView } from './ResultadoView';

type Estado =
  | { fase: 'upload'; erro?: string }
  | { fase: 'lendo'; arquivo: string; etapa: string; fracao?: number }
  | { fase: 'conferencia'; doc: Documento; prep: Preparacao }
  | { fase: 'resultado'; doc: Documento; resultado: Resultado; avisoHistorico?: string };

export function VerificarTab({ sb }: { sb: SupabaseClient }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'upload' });
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function abrir(file: File) {
    if (!tipoDoArquivo(file.name)) {
      setEstado({ fase: 'upload', erro: `Formato não suportado. Formatos aceitos: ${FORMATOS_ACEITOS}.` });
      return;
    }
    setEstado({ fase: 'lendo', arquivo: file.name, etapa: 'Lendo o documento…' });
    try {
      const bytes = await file.arrayBuffer();
      const doc = await lerDocumento(file.name, bytes, (etapa, fracao) => setEstado({ fase: 'lendo', arquivo: file.name, etapa, fracao }));
      if (doc.grids.length === 0 || doc.grids.every((g) => g.rows.length === 0)) throw new Error('Nenhuma tabela encontrada no documento.');
      setEstado({ fase: 'conferencia', doc, prep: prepararAutomatico(doc) });
    } catch (e) {
      setEstado({ fase: 'upload', erro: `Não foi possível ler "${file.name}": ${(e as Error).message}` });
    }
  }

  async function executar(doc: Documento, d: DadosConferencia) {
    const tabela = await carregarTabela(sb, d.dataBase);
    if (!tabela) throw new Error(`A tabela SINAPI-BA ${d.dataBase} não está cadastrada.`);
    const resultado = verificar(d.orcamento, tabela, { dataBase: d.dataBase, regime: d.regime, bdi: d.bdi, encargos: d.encargos }, d.config);
    let avisoHistorico: string | undefined;
    try {
      await registrarVerificacao(sb, resultado);
    } catch (e) {
      avisoHistorico = `A verificação foi concluída, mas não foi registrada no histórico: ${(e as Error).message}`;
    }
    setEstado({ fase: 'resultado', doc, resultado, avisoHistorico });
  }

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    const f = e.dataTransfer.files[0];
    if (f) abrir(f);
  };

  if (estado.fase === 'conferencia') {
    return (
      <Conferencia
        sb={sb}
        doc={estado.doc}
        prep={estado.prep}
        onCancelar={() => setEstado({ fase: 'upload' })}
        onVerificar={(d) => executar(estado.doc, d)}
      />
    );
  }
  if (estado.fase === 'resultado') {
    return (
      <ResultadoView
        doc={estado.doc}
        resultado={estado.resultado}
        avisoHistorico={estado.avisoHistorico}
        onNova={() => setEstado({ fase: 'upload' })}
      />
    );
  }

  return (
    <section className="card">
      <h2>Verificar orçamento</h2>
      {estado.fase === 'lendo' ? (
        <div>
          <p>
            <strong>{estado.arquivo}</strong> — {estado.etapa}
          </p>
          <div className="progresso" aria-label="progresso">
            <div style={{ width: `${Math.round((estado.fracao ?? 0.15) * 100)}%` }} />
          </div>
        </div>
      ) : (
        <>
          <div
            className={`drop ${arrastando ? 'ativo' : ''}`}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={soltar}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          >
            <p><strong>Arraste o orçamento aqui</strong> ou clique para escolher o arquivo</p>
            <p className="muted small">Excel (.xlsx, .xls), PDF (com texto ou escaneado), Word (.docx) ou imagem (.png, .jpg) — até 50 MB</p>
            <p className="muted small">O arquivo é lido no seu navegador e não é enviado ao servidor.</p>
          </div>
          <input
            ref={input}
            data-testid="arquivo-orcamento"
            type="file"
            accept={FORMATOS_ACEITOS}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) abrir(f);
            }}
          />
          {estado.erro && <div className="alerta erro" role="alert">{estado.erro}</div>}
        </>
      )}
    </section>
  );
}
