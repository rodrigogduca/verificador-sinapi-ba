import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { atualizarUsuario, listarUsuarios, type Papel, type Perfil } from '../backend/repo';

export function UsuariosTab({ sb, meuId }: { sb: SupabaseClient; meuId: string }) {
  const [usuarios, setUsuarios] = useState<Perfil[]>([]);
  const [erro, setErro] = useState<string>();

  const recarregar = useCallback(() => {
    listarUsuarios(sb).then(setUsuarios).catch((e: Error) => setErro(e.message));
  }, [sb]);
  useEffect(recarregar, [recarregar]);

  async function alterar(id: string, campos: Partial<Pick<Perfil, 'papel' | 'ativo'>>) {
    setErro(undefined);
    try {
      await atualizarUsuario(sb, id, campos);
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <>
      <section className="card">
        <h2>Usuários</h2>
        {erro && <div className="alerta erro">{erro}</div>}
        <div className="tabela-wrap">
          <table data-testid="usuarios">
            <thead><tr><th>E-mail</th><th>Papel</th><th>Situação</th><th>Desde</th></tr></thead>
            <tbody>
              {usuarios.map((u) => {
                const eu = u.id === meuId;
                return (
                  <tr key={u.id}>
                    <td>{u.email}{eu ? ' (você)' : ''}</td>
                    <td>
                      <select value={u.papel} disabled={eu} onChange={(e) => alterar(u.id, { papel: e.target.value as Papel })} aria-label={`papel de ${u.email}`}>
                        <option value="analista">Analista</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td>
                      <button className={`btn ${u.ativo ? 'perigo' : ''}`} disabled={eu} onClick={() => alterar(u.id, { ativo: !u.ativo })}>
                        {u.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                      <span className="small muted"> {u.ativo ? 'ativo' : 'desativado'}</span>
                    </td>
                    <td className="small">{new Date(u.criado_em).toLocaleDateString('pt-BR')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2>Como convidar um novo usuário</h2>
        <ol className="small">
          <li>Abra o painel do Supabase do projeto → <strong>Authentication → Users → Add user</strong>.</li>
          <li><strong>Send invitation</strong>: a pessoa recebe um link por e-mail e define a própria senha (exige e-mail configurado no Supabase; sem SMTP próprio, só funciona para e-mails da equipe do Supabase).</li>
          <li>Ou <strong>Create new user</strong> com uma senha provisória e <em>Auto Confirm User</em> marcado: envie a senha à pessoa, que troca em <strong>Alterar senha</strong> no primeiro acesso.</li>
          <li>Todo usuário novo entra como <strong>analista</strong>. Para dar acesso de administrador, mude o papel aqui nesta tela.</li>
        </ol>
        <p className="muted small">O convite é feito pelo painel para que a chave de administração do banco nunca fique no site. Desativar um usuário corta o acesso aos dados imediatamente.</p>
      </section>
    </>
  );
}
