// Testes das regras de segurança (RLS) contra o Supabase LOCAL (supabase start).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  atualizarUsuario, carregarTabela, excluirTabela, listarTabelas, listarUsuarios, listarVerificacoes,
  perfilAtual, registrarVerificacao, salvarTabela,
} from '../../src/backend/repo';
import { CONFIG_PADRAO } from '../../src/domain/types';
import { lerDocumento, montarOrcamento, prepararAutomatico } from '../../src/extract';
import { verificar } from '../../src/verify/engine';
import { orcamentoExcel } from '../fixtures/generate';
import { tabelaTeste } from '../unit/helpers';
import { ambienteLocal } from './env';

const env = ambienteLocal();
const servico = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const SENHA = 'SenhaForte123';

async function limparTudo() {
  await servico.from('verificacoes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await servico.from('sinapi_tabelas').delete().neq('data_base', '');
  const { data } = await servico.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users) await servico.auth.admin.deleteUser(u.id);
}

async function criarUsuario(email: string): Promise<string> {
  const { data, error } = await servico.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
  if (error) throw error;
  return data.user!.id;
}

async function entrar(email: string): Promise<SupabaseClient> {
  const sb = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password: SENHA });
  if (error) throw error;
  return sb;
}

let admin: SupabaseClient;
let analista: SupabaseClient;
let analista2: SupabaseClient;
let idAdmin: string;
let idAnalista: string;
const anon = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

beforeAll(async () => {
  await limparTudo();
  idAdmin = await criarUsuario('admin@teste.local');
  idAnalista = await criarUsuario('analista@teste.local');
  await criarUsuario('analista2@teste.local');
  admin = await entrar('admin@teste.local');
  analista = await entrar('analista@teste.local');
  analista2 = await entrar('analista2@teste.local');
}, 60_000);

describe('autenticação e perfis', () => {
  it('primeiro usuário é admin; os demais, analistas', async () => {
    expect((await perfilAtual(admin))?.papel).toBe('admin');
    expect((await perfilAtual(analista))?.papel).toBe('analista');
  });

  it('cadastro público está desligado', async () => {
    const { error } = await anon.auth.signUp({ email: 'intruso@teste.local', password: SENHA });
    expect(error).not.toBeNull();
  });

  it('senha fraca é recusada', async () => {
    const { error } = await admin.auth.updateUser({ password: 'fraca' });
    expect(error).not.toBeNull();
  });

  it('analista vê só o próprio perfil; admin vê todos', async () => {
    expect((await listarUsuarios(analista)).map((p) => p.id)).toEqual([idAnalista]);
    expect(await listarUsuarios(admin)).toHaveLength(3);
  });

  it('analista não consegue se promover a admin', async () => {
    await expect(atualizarUsuario(analista, idAnalista, { papel: 'admin' })).rejects.toThrow();
    expect((await perfilAtual(analista))?.papel).toBe('analista');
  });

  it('admin não consegue se rebaixar nem se desativar', async () => {
    await expect(atualizarUsuario(admin, idAdmin, { papel: 'analista' })).rejects.toThrow();
    await expect(atualizarUsuario(admin, idAdmin, { ativo: false })).rejects.toThrow();
  });

  it('ninguém altera o e-mail do perfil pela API', async () => {
    const { error } = await admin.from('perfis').update({ email: 'x@y.z' }).eq('id', idAnalista);
    expect(error).not.toBeNull();
  });
});

describe('tabelas SINAPI', () => {
  it('anônimo não lê nada', async () => {
    const { data } = await anon.from('sinapi_tabelas').select('*');
    expect(data ?? []).toEqual([]);
    const { data: p } = await anon.from('perfis').select('*');
    expect(p ?? []).toEqual([]);
  });

  it('analista não grava', async () => {
    await expect(salvarTabela(analista, tabelaTeste())).rejects.toThrow();
  });

  it('admin grava; analista lê a tabela completa', async () => {
    const t = tabelaTeste();
    await salvarTabela(admin, t);
    expect((await listarTabelas(analista)).map((x) => x.data_base)).toEqual(['2026-08']);
    const lida = await carregarTabela(analista, '2026-08');
    expect(Object.keys(lida!.entries).sort()).toEqual(Object.keys(t.entries).sort());
    expect(lida!.entries['composicao:96995'].preco).toEqual({ nao_desonerado: 41.83, desonerado: 36.92 });
  });

  it('analista não exclui; admin exclui (e recria para os próximos testes)', async () => {
    await expect(excluirTabela(analista, '2026-08')).rejects.toThrow();
    await excluirTabela(admin, '2026-08');
    expect(await listarTabelas(admin)).toEqual([]);
    await salvarTabela(admin, tabelaTeste());
  });
});

describe('histórico de verificações', () => {
  it('registra; analista vê só o seu; admin vê todos; ninguém altera', async () => {
    const bytes = await orcamentoExcel();
    const doc = await lerDocumento('orcamento.xlsx', bytes);
    const prep = prepararAutomatico(doc);
    const orc = montarOrcamento(doc, doc.grids[prep.indiceGrid], prep.mapeamento!, prep.meta);
    const tabela = (await carregarTabela(analista, '2026-08'))!;
    const r = verificar(orc, tabela, { dataBase: '2026-08', regime: 'nao_desonerado', bdi: 0.25 }, CONFIG_PADRAO);

    const id = await registrarVerificacao(analista, r);
    await registrarVerificacao(analista2, r);

    const meus = await listarVerificacoes(analista);
    expect(meus.map((v) => v.id)).toEqual([id]);
    expect(meus[0].resumo.corrigidos).toBe(5);
    expect(await listarVerificacoes(admin)).toHaveLength(2);

    const { data: upd } = await analista.from('verificacoes').update({ arquivo: 'adulterado' }).eq('id', id).select();
    expect(upd ?? []).toEqual([]);
    const { data: del } = await analista.from('verificacoes').delete().eq('id', id).select();
    expect(del ?? []).toEqual([]);
  });

  it('não é possível registrar em nome de outro usuário', async () => {
    const { error } = await analista.from('verificacoes').insert({
      user_id: idAdmin, arquivo: 'x', data_base: '2026-08', regime: 'nao_desonerado', resumo: {}, correcoes: [],
    });
    expect(error).not.toBeNull();
  });
});

describe('desativação', () => {
  it('usuário desativado perde acesso imediatamente, mesmo com sessão aberta', async () => {
    await atualizarUsuario(admin, idAnalista, { ativo: false });
    expect(await listarTabelas(analista)).toEqual([]);
    expect(await listarVerificacoes(analista)).toEqual([]);
    await atualizarUsuario(admin, idAnalista, { ativo: true });
    expect(await listarTabelas(analista)).toHaveLength(1);
  });
});
