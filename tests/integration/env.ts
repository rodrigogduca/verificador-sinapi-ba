// Lê URL e chaves do Supabase LOCAL a partir de `supabase status -o env`.
import { execSync } from 'node:child_process';

export interface AmbienteLocal {
  url: string;
  anonKey: string;
  serviceKey: string;
}

let cache: AmbienteLocal | undefined;

export function ambienteLocal(): AmbienteLocal {
  if (cache) return cache;
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const vars: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) vars[m[1]] = m[2];
  }
  const url = vars.API_URL;
  const anonKey = vars.ANON_KEY ?? vars.PUBLISHABLE_KEY;
  const serviceKey = vars.SERVICE_ROLE_KEY ?? vars.SECRET_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase local não está rodando (npx supabase start).');
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error('Testes de integração só rodam contra o Supabase LOCAL.');
  cache = { url, anonKey, serviceKey };
  return cache;
}
