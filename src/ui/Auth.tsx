import type { SupabaseClient } from '@supabase/supabase-js';
import { useState, type FormEvent } from 'react';

const traduzir = (m: string) => {
  if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(m)) return 'E-mail ainda não confirmado.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (/password/i.test(m) && /(weak|characters|least|contain)/i.test(m)) {
    return 'Senha fraca: use pelo menos 10 caracteres, com letras maiúsculas, minúsculas e números.';
  }
  if (/same.*password|different from the old/i.test(m)) return 'A nova senha deve ser diferente da anterior.';
  return m;
};

export function Login({ sb }: { sb: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [modo, setModo] = useState<'entrar' | 'esqueci'>('entrar');
  const [erro, setErro] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(undefined);
    setMsg(undefined);
    setOcupado(true);
    try {
      if (modo === 'entrar') {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw error;
      } else {
        const redirectTo = window.location.origin + import.meta.env.BASE_URL;
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) throw error;
        setMsg('Se o e-mail estiver cadastrado, você receberá um link para definir uma nova senha.');
      }
    } catch (err) {
      setErro(traduzir((err as Error).message));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="login">
      <form className="card" onSubmit={enviar}>
        <h2>Verificador SINAPI-BA</h2>
        <p className="muted small">{modo === 'entrar' ? 'Entre com seu e-mail e senha.' : 'Informe seu e-mail para receber o link de nova senha.'}</p>
        <label className="campo">
          E-mail
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {modo === 'entrar' && (
          <label className="campo" style={{ marginTop: 10 }}>
            Senha
            <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </label>
        )}
        {erro && <div className="alerta erro" role="alert">{erro}</div>}
        {msg && <div className="alerta ok">{msg}</div>}
        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <button className="btn primario" disabled={ocupado} type="submit">
            {modo === 'entrar' ? 'Entrar' : 'Enviar link'}
          </button>
          <button type="button" className="link small" onClick={() => setModo(modo === 'entrar' ? 'esqueci' : 'entrar')}>
            {modo === 'entrar' ? 'Esqueci minha senha' : 'Voltar ao login'}
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 16 }}>Não há cadastro público. O acesso é liberado por convite do administrador.</p>
      </form>
    </main>
  );
}

export function DefinirSenha({ sb, convite, onConcluir }: { sb: SupabaseClient; convite: boolean; onConcluir: () => void }) {
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string>();
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(undefined);
    if (senha !== confirma) return setErro('As senhas não conferem.');
    if (senha.length < 10 || !/[a-z]/.test(senha) || !/[A-Z]/.test(senha) || !/\d/.test(senha)) {
      return setErro('Use pelo menos 10 caracteres, com letras maiúsculas, minúsculas e números.');
    }
    setOcupado(true);
    const { error } = await sb.auth.updateUser({ password: senha });
    setOcupado(false);
    if (error) return setErro(traduzir(error.message));
    window.history.replaceState(null, '', window.location.pathname);
    onConcluir();
  }

  return (
    <main className="login">
      <form className="card" onSubmit={enviar}>
        <h2>{convite ? 'Bem-vindo(a)! Crie sua senha' : 'Definir nova senha'}</h2>
        <label className="campo">
          Nova senha
          <input type="password" autoComplete="new-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
        <label className="campo" style={{ marginTop: 10 }}>
          Confirme a senha
          <input type="password" autoComplete="new-password" required value={confirma} onChange={(e) => setConfirma(e.target.value)} />
        </label>
        <p className="muted small">Mínimo de 10 caracteres, com letras maiúsculas, minúsculas e números.</p>
        {erro && <div className="alerta erro" role="alert">{erro}</div>}
        <button className="btn primario" disabled={ocupado} type="submit">Salvar senha</button>
      </form>
    </main>
  );
}
