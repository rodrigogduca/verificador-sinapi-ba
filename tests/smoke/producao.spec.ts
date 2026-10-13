// Teste de fumaça em PRODUÇÃO (não cria nem altera dados).
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SMOKE_SUPABASE_URL!;
const ANON = process.env.SMOKE_SUPABASE_ANON_KEY!;

test('site no ar com HTTPS, CSP e tela de login', async ({ page }) => {
  const erros: string[] = [];
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
  const resp = await page.goto('./');
  expect(resp?.status()).toBe(200);
  expect(page.url()).toMatch(/^https:\/\//);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain(`connect-src 'self' blob: data: ${new URL(SUPABASE_URL).origin}`);
  expect(csp).not.toMatch(/'unsafe-eval'/); // só 'wasm-unsafe-eval' (WebAssembly) é permitido
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

  // login inválido chega ao Supabase de produção e é recusado
  await page.getByLabel('E-mail').fill('ninguem@exemplo.com');
  await page.getByLabel('Senha').fill('SenhaQualquer123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
  expect(erros.filter((e) => !/400|Bad Request/.test(e))).toEqual([]);
});

test('arquivos de OCR e pdf.js servidos pelo próprio site', async ({ request }) => {
  for (const f of ['vendor/pdfjs/pdf.worker.min.mjs', 'vendor/tesseract/worker.min.js', 'vendor/tesseract/lang/por.traineddata.gz']) {
    const r = await request.get(f);
    expect(r.status(), f).toBe(200);
  }
});

test('banco de produção: anônimo não lê nada e não há cadastro público', async () => {
  const sb = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  for (const t of ['perfis', 'sinapi_tabelas', 'sinapi_itens', 'verificacoes']) {
    const { data } = await sb.from(t).select('*').limit(1);
    expect(data ?? [], t).toEqual([]);
  }
  const { error: e1 } = await sb.from('sinapi_tabelas').insert({ data_base: '2099-01' });
  expect(e1).not.toBeNull();
  const { error: e2 } = await sb.auth.signUp({ email: `intruso.${Date.now()}@exemplo.com`, password: 'SenhaForte12345' });
  expect(e2?.message).toMatch(/signup|disabled|not allowed/i);
});
