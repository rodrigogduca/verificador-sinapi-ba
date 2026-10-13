// Cliente Supabase. Só a chave pública (anon) fica no site; as permissões são garantidas por RLS no banco.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Tipo do link de e-mail que abriu o site (lido antes de o cliente limpar a URL). */
export const tipoLinkInicial: string | null = (() => {
  if (typeof window === 'undefined') return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return hash.get('type');
})();

export function criarCliente(url: string, anonKey: string, opts: { persistir?: boolean } = {}): SupabaseClient {
  const persistir = opts.persistir ?? true;
  return createClient(url, anonKey, {
    auth: { persistSession: persistir, autoRefreshToken: persistir, detectSessionInUrl: persistir, flowType: 'implicit' },
  });
}

let cliente: SupabaseClient | undefined;

export function supabase(): SupabaseClient {
  if (!cliente) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Configuração ausente: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
    cliente = criarCliente(url, key);
  }
  return cliente;
}
