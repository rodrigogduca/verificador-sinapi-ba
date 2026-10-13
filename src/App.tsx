import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { supabase, tipoLinkInicial } from './backend/client';
import { perfilAtual, type Perfil } from './backend/repo';
import { DefinirSenha, Login } from './ui/Auth';
import { HistoricoTab } from './ui/HistoricoTab';
import { SinapiTab } from './ui/SinapiTab';
import { SobreTab } from './ui/SobreTab';
import { UsuariosTab } from './ui/UsuariosTab';
import { VerificarTab } from './ui/VerificarTab';

type Aba = 'verificar' | 'sinapi' | 'historico' | 'usuarios' | 'sobre';

export default function App() {
  const sb = supabase();
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [definirSenha, setDefinirSenha] = useState(tipoLinkInicial === 'invite' || tipoLinkInicial === 'recovery');
  const [alterarSenha, setAlterarSenha] = useState(false);
  const [aba, setAba] = useState<Aba>('verificar');
  const [erroPerfil, setErroPerfil] = useState<string>();

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = sb.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === 'PASSWORD_RECOVERY') setDefinirSenha(true);
    });
    return () => data.subscription.unsubscribe();
  }, [sb]);

  const recarregarPerfil = useCallback(() => {
    if (!sessao) {
      setPerfil(null);
      return;
    }
    perfilAtual(sb).then(setPerfil).catch((e: Error) => setErroPerfil(e.message));
  }, [sb, sessao]);

  useEffect(recarregarPerfil, [recarregarPerfil]);

  const sair = () => sb.auth.signOut();

  if (sessao === undefined) return <main className="muted">Carregando…</main>;
  if (!sessao) return <Login sb={sb} />;
  if (definirSenha) return <DefinirSenha sb={sb} convite={tipoLinkInicial === 'invite'} onConcluir={() => setDefinirSenha(false)} />;
  if (alterarSenha) return <DefinirSenha sb={sb} convite={false} onConcluir={() => setAlterarSenha(false)} onCancelar={() => setAlterarSenha(false)} />;
  if (erroPerfil) return <main><div className="alerta erro">{erroPerfil}</div><button className="btn" onClick={sair}>Sair</button></main>;
  if (!perfil) return <main className="muted">Carregando perfil…</main>;
  if (!perfil.ativo) {
    return (
      <main className="login card">
        <h2>Acesso desativado</h2>
        <p>Seu usuário foi desativado. Fale com o administrador do sistema.</p>
        <button className="btn" onClick={sair}>Sair</button>
      </main>
    );
  }

  const admin = perfil.papel === 'admin';
  const abas: [Aba, string][] = [
    ['verificar', 'Verificar orçamento'],
    ['sinapi', 'Tabelas SINAPI'],
    ['historico', 'Histórico'],
    ...(admin ? ([['usuarios', 'Usuários']] as [Aba, string][]) : []),
    ['sobre', 'Sobre e privacidade'],
  ];

  return (
    <>
      <header className="topo">
        <h1>Verificador SINAPI-BA</h1>
        <nav className="abas" role="tablist">
          {abas.map(([id, rotulo]) => (
            <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)}>
              {rotulo}
            </button>
          ))}
        </nav>
        <div className="usuario">
          <span data-testid="usuario-logado">{perfil.email} ({admin ? 'administrador' : 'analista'})</span>
          <button className="btn" onClick={() => setAlterarSenha(true)}>Alterar senha</button>
          <button className="btn" onClick={sair}>Sair</button>
        </div>
      </header>
      <main>
        {/* a aba Verificar fica montada para não perder o trabalho ao trocar de aba */}
        <div hidden={aba !== 'verificar'}><VerificarTab sb={sb} /></div>
        {aba === 'sinapi' && <SinapiTab sb={sb} admin={admin} />}
        {aba === 'historico' && <HistoricoTab sb={sb} admin={admin} />}
        {aba === 'usuarios' && admin && <UsuariosTab sb={sb} meuId={perfil.id} />}
        {aba === 'sobre' && <SobreTab />}
      </main>
    </>
  );
}
