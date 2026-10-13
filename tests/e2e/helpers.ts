import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Falha o teste se houver erro de console ou violação de CSP. */
export function vigiarConsole(page: Page): string[] {
  const erros: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  page.on('pageerror', (e) => erros.push(e.message));
  return erros;
}

export async function entrar(page: Page, email: string, senha: string) {
  await page.goto('./');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByTestId('usuario-logado')).toContainText(email);
}

export async function baixarArquivo(page: Page, testId: string): Promise<Buffer> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()]);
  const path = await download.path();
  return readFileSync(path!);
}
