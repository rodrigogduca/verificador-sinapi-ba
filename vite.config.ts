import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Injeta a origem do Supabase na CSP (connect-src) do index.html. */
function cspSupabase(url: string | undefined): Plugin {
  return {
    name: 'csp-supabase',
    transformIndexHtml(html) {
      if (!url) throw new Error('VITE_SUPABASE_URL não definido (veja .env.example).');
      const origem = new URL(url).origin;
      return html.replace('%SUPABASE_ORIGIN%', origem);
    },
  };
}

// Publicado em https://<usuario>.github.io/verificador-sinapi-ba/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: env.VITE_BASE ?? '/verificador-sinapi-ba/',
    plugins: [react(), cspSupabase(env.VITE_SUPABASE_URL)],
    build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 4000 },
    worker: { format: 'es' },
    server: { port: 5173, strictPort: true },
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
      testTimeout: 30000,
    },
  };
});
