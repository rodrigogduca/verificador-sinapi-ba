-- Verificador SINAPI-BA — esquema inicial
-- Segurança: RLS em todas as tabelas; anon sem acesso; somente usuários ativos leem dados;
-- somente administradores alteram tabelas SINAPI e perfis. Documentos NÃO são armazenados.

create type public.papel as enum ('admin', 'analista');

-- ---------------------------------------------------------------- perfis
create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nome text,
  papel public.papel not null default 'analista',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create or replace function public.eh_ativo()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and ativo);
$$;

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and ativo and papel = 'admin');
$$;

-- novo usuário (convidado pelo administrador) ganha perfil; o primeiro usuário vira admin
create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(727274);
  insert into public.perfis (id, email, papel)
  values (
    new.id,
    coalesce(new.email, ''),
    case when exists (select 1 from public.perfis where papel = 'admin') then 'analista'::public.papel
         else 'admin'::public.papel end
  );
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil();

alter table public.perfis enable row level security;

create policy perfis_select on public.perfis for select to authenticated
  using (id = (select auth.uid()) or public.eh_admin());

-- admin altera papel/ativo/nome de OUTROS usuários (não pode se rebaixar ou se desativar)
create policy perfis_update on public.perfis for update to authenticated
  using (public.eh_admin() and id <> (select auth.uid()))
  with check (public.eh_admin() and id <> (select auth.uid()));

revoke all on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;
grant update (nome, papel, ativo) on public.perfis to authenticated;

-- ---------------------------------------------------------------- tabelas SINAPI
create table public.sinapi_tabelas (
  data_base text primary key check (data_base ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  uf text not null default 'BA' check (uf = 'BA'),
  arquivos text[] not null default '{}',
  importado_em timestamptz not null default now(),
  importado_por uuid references public.perfis (id) on delete set null default auth.uid()
);

create table public.sinapi_itens (
  data_base text not null references public.sinapi_tabelas (data_base) on delete cascade,
  tipo text not null check (tipo in ('composicao', 'insumo')),
  codigo text not null check (codigo ~ '^\d{1,8}$'),
  descricao text not null check (length(descricao) <= 2000),
  unidade text not null check (length(unidade) <= 30),
  preco_nao_desonerado numeric(16, 4),
  preco_desonerado numeric(16, 4),
  primary key (data_base, tipo, codigo)
);

alter table public.sinapi_tabelas enable row level security;
alter table public.sinapi_itens enable row level security;

create policy sinapi_tabelas_select on public.sinapi_tabelas for select to authenticated using (public.eh_ativo());
create policy sinapi_tabelas_insert on public.sinapi_tabelas for insert to authenticated with check (public.eh_admin());
create policy sinapi_tabelas_update on public.sinapi_tabelas for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy sinapi_tabelas_delete on public.sinapi_tabelas for delete to authenticated using (public.eh_admin());

create policy sinapi_itens_select on public.sinapi_itens for select to authenticated using (public.eh_ativo());
create policy sinapi_itens_insert on public.sinapi_itens for insert to authenticated with check (public.eh_admin());
create policy sinapi_itens_update on public.sinapi_itens for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy sinapi_itens_delete on public.sinapi_itens for delete to authenticated using (public.eh_admin());

revoke all on public.sinapi_tabelas, public.sinapi_itens from anon, authenticated;
grant select, insert, update, delete on public.sinapi_tabelas, public.sinapi_itens to authenticated;

-- ---------------------------------------------------------------- histórico de verificações
create table public.verificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  arquivo text not null check (length(arquivo) <= 300),
  data_base text not null,
  regime text not null check (regime in ('nao_desonerado', 'desonerado')),
  bdi numeric(8, 6),
  ocr boolean not null default false,
  resumo jsonb not null,
  correcoes jsonb not null check (octet_length(correcoes::text) <= 5000000),
  criado_em timestamptz not null default now()
);
create index verificacoes_user_criado on public.verificacoes (user_id, criado_em desc);

alter table public.verificacoes enable row level security;

create policy verificacoes_insert on public.verificacoes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.eh_ativo());
create policy verificacoes_select on public.verificacoes for select to authenticated
  using ((user_id = (select auth.uid()) and public.eh_ativo()) or public.eh_admin());
create policy verificacoes_delete on public.verificacoes for delete to authenticated
  using (public.eh_admin());

revoke all on public.verificacoes from anon, authenticated;
grant select, insert, delete on public.verificacoes to authenticated;

revoke execute on function public.criar_perfil() from public, anon, authenticated;
