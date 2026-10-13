// Acesso ao banco (Supabase/PostgreSQL). Todas as funções recebem o cliente, para serem testáveis.
import type { SupabaseClient } from '@supabase/supabase-js';
import { entryKey, type Correcao, type Regime, type Resultado, type Resumo, type SinapiTable, type TipoRef } from '../domain/types';

export type Papel = 'admin' | 'analista';

export interface Perfil {
  id: string;
  email: string;
  nome: string | null;
  papel: Papel;
  ativo: boolean;
  criado_em: string;
}

export interface TabelaInfo {
  data_base: string;
  arquivos: string[];
  importado_em: string;
}

export interface VerificacaoRegistro {
  id: string;
  user_id: string;
  arquivo: string;
  data_base: string;
  regime: Regime;
  bdi: number | null;
  ocr: boolean;
  resumo: Resumo;
  correcoes: Correcao[];
  criado_em: string;
  perfis?: { email: string } | null;
}

const LOTE = 1000;

function falha(e: { message: string } | null, contexto: string): void {
  if (e) throw new Error(`${contexto}: ${e.message}`);
}

// ------------------------------------------------------------------ perfis
export async function perfilAtual(sb: SupabaseClient): Promise<Perfil | null> {
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await sb.from('perfis').select('*').eq('id', u.user.id).maybeSingle();
  falha(error, 'Erro ao carregar o perfil');
  return data as Perfil | null;
}

export async function listarUsuarios(sb: SupabaseClient): Promise<Perfil[]> {
  const { data, error } = await sb.from('perfis').select('*').order('criado_em');
  falha(error, 'Erro ao listar usuários');
  return (data ?? []) as Perfil[];
}

export async function atualizarUsuario(sb: SupabaseClient, id: string, campos: Partial<Pick<Perfil, 'papel' | 'ativo' | 'nome'>>) {
  const { data, error } = await sb.from('perfis').update(campos).eq('id', id).select();
  falha(error, 'Erro ao atualizar usuário');
  if (!data || data.length === 0) throw new Error('Sem permissão para alterar este usuário.');
}

// ------------------------------------------------------------------ tabelas SINAPI
export async function listarTabelas(sb: SupabaseClient): Promise<TabelaInfo[]> {
  const { data, error } = await sb.from('sinapi_tabelas').select('data_base, arquivos, importado_em').order('data_base', { ascending: false });
  falha(error, 'Erro ao listar tabelas SINAPI');
  return (data ?? []) as TabelaInfo[];
}

interface ItemRow {
  data_base: string;
  tipo: TipoRef;
  codigo: string;
  descricao: string;
  unidade: string;
  preco_nao_desonerado: number | string | null;
  preco_desonerado: number | string | null;
}

const num = (v: number | string | null) => (v === null || v === undefined ? undefined : Number(v));

const cache = new Map<string, { importadoEm: string; tabela: SinapiTable }>();

export async function carregarTabela(sb: SupabaseClient, dataBase: string): Promise<SinapiTable | undefined> {
  const { data: info, error: e1 } = await sb.from('sinapi_tabelas').select('*').eq('data_base', dataBase).maybeSingle();
  falha(e1, 'Erro ao carregar tabela');
  if (!info) return undefined;
  const emCache = cache.get(dataBase);
  if (emCache && emCache.importadoEm === info.importado_em) return emCache.tabela;

  const entries: SinapiTable['entries'] = {};
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await sb
      .from('sinapi_itens')
      .select('*')
      .eq('data_base', dataBase)
      .order('tipo')
      .order('codigo')
      .range(de, de + LOTE - 1);
    falha(error, 'Erro ao carregar itens SINAPI');
    const rows = (data ?? []) as ItemRow[];
    for (const r of rows) {
      const preco: SinapiTable['entries'][string]['preco'] = {};
      const nd = num(r.preco_nao_desonerado);
      const d = num(r.preco_desonerado);
      if (nd !== undefined) preco.nao_desonerado = nd;
      if (d !== undefined) preco.desonerado = d;
      entries[entryKey(r.tipo, r.codigo)] = { codigo: r.codigo, tipo: r.tipo, descricao: r.descricao, unidade: r.unidade, preco };
    }
    if (rows.length < LOTE) break;
  }
  const tabela: SinapiTable = { dataBase, uf: 'BA', entries, importadoEm: info.importado_em, arquivos: info.arquivos ?? [] };
  cache.set(dataBase, { importadoEm: info.importado_em, tabela });
  return tabela;
}

export async function salvarTabela(sb: SupabaseClient, t: SinapiTable, onProgresso?: (f: number) => void): Promise<void> {
  const { error } = await sb
    .from('sinapi_tabelas')
    .upsert({ data_base: t.dataBase, arquivos: t.arquivos, importado_em: new Date().toISOString() }, { onConflict: 'data_base' });
  falha(error, 'Erro ao salvar tabela SINAPI');
  const rows: ItemRow[] = Object.values(t.entries).map((e) => ({
    data_base: t.dataBase,
    tipo: e.tipo,
    codigo: e.codigo,
    descricao: e.descricao.slice(0, 2000),
    unidade: e.unidade.slice(0, 30),
    preco_nao_desonerado: e.preco.nao_desonerado ?? null,
    preco_desonerado: e.preco.desonerado ?? null,
  }));
  for (let i = 0; i < rows.length; i += LOTE) {
    const { error: e2 } = await sb.from('sinapi_itens').upsert(rows.slice(i, i + LOTE), { onConflict: 'data_base,tipo,codigo' });
    falha(e2, 'Erro ao salvar itens SINAPI');
    onProgresso?.(Math.min(1, (i + LOTE) / rows.length));
  }
  cache.delete(t.dataBase);
}

export async function excluirTabela(sb: SupabaseClient, dataBase: string): Promise<void> {
  const { data, error } = await sb.from('sinapi_tabelas').delete().eq('data_base', dataBase).select();
  falha(error, 'Erro ao excluir tabela');
  if (!data || data.length === 0) throw new Error('Sem permissão para excluir esta tabela.');
  cache.delete(dataBase);
}

// ------------------------------------------------------------------ histórico
export async function registrarVerificacao(sb: SupabaseClient, r: Resultado): Promise<string> {
  const { data, error } = await sb
    .from('verificacoes')
    .insert({
      arquivo: r.contexto.arquivo.slice(0, 300),
      data_base: r.contexto.dataBase,
      regime: r.contexto.regime,
      bdi: r.contexto.bdi ?? null,
      ocr: r.contexto.ocr,
      resumo: r.resumo,
      correcoes: r.correcoes.map(({ loc: _loc, ...c }) => c),
    })
    .select('id')
    .single();
  falha(error, 'Erro ao registrar a verificação no histórico');
  return (data as { id: string }).id;
}

export async function listarVerificacoes(sb: SupabaseClient, limite = 100): Promise<VerificacaoRegistro[]> {
  const { data, error } = await sb
    .from('verificacoes')
    .select('*, perfis(email)')
    .order('criado_em', { ascending: false })
    .limit(limite);
  falha(error, 'Erro ao carregar o histórico');
  return (data ?? []) as VerificacaoRegistro[];
}

export async function excluirVerificacao(sb: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await sb.from('verificacoes').delete().eq('id', id).select();
  falha(error, 'Erro ao excluir registro');
  if (!data || data.length === 0) throw new Error('Sem permissão para excluir este registro.');
}
