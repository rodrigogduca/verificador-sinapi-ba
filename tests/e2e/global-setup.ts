// Prepara o Supabase LOCAL e os arquivos de teste antes dos testes E2E.
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ambienteLocal } from '../integration/env';
import { orcamentoExcel, sinapiFormatoNovo } from '../fixtures/generate';

export const OUT = join(process.cwd(), 'tests', 'fixtures', 'out');
export const ADMIN = { email: 'admin@e2e.local', senha: 'AdminE2E2026' };
export const ANALISTA = { email: 'analista@e2e.local', senha: 'AnalistaE2E2026' };

export default async function globalSetup() {
  const env = ambienteLocal();
  const sb = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await sb.from('verificacoes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await sb.from('sinapi_tabelas').delete().neq('data_base', '');
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users) await sb.auth.admin.deleteUser(u.id);
  for (const u of [ADMIN, ANALISTA]) {
    const { error } = await sb.auth.admin.createUser({ email: u.email, password: u.senha, email_confirm: true });
    if (error) throw error;
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'SINAPI_Referencia_2026_08.xlsx'), Buffer.from(sinapiFormatoNovo()));
  writeFileSync(join(OUT, 'orcamento-escola.xlsx'), Buffer.from(await orcamentoExcel()));
  const { gerarArquivosExtras } = await import('./extras');
  await gerarArquivosExtras(OUT);
}
