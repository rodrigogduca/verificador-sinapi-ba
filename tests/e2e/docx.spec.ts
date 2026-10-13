import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { ADMIN, OUT } from './global-setup';
import { baixarArquivo, entrar, vigiarConsole } from './helpers';

test('verifica orçamento em Word e baixa o .docx corrigido', async ({ page }) => {
  const erros = vigiarConsole(page);
  await entrar(page, ADMIN.email, ADMIN.senha);
  await page.getByRole('tab', { name: 'Tabelas SINAPI' }).click();
  if (!(await page.getByTestId('tabelas-sinapi').getByText('08/2026').count())) {
    await page.getByTestId('arquivo-sinapi').setInputFiles(join(OUT, 'SINAPI_Referencia_2026_08.xlsx'));
    await page.getByTestId('salvar-sinapi').click();
    await expect(page.getByTestId('sinapi-msg')).toBeVisible();
  }
  await page.getByRole('tab', { name: 'Verificar orçamento' }).click();
  await page.getByTestId('arquivo-orcamento').setInputFiles(join(OUT, 'orcamento-escola.docx'));
  await expect(page.getByTestId('resumo-extracao')).toContainText('9 itens');
  await page.getByTestId('verificar').click();
  await expect(page.getByTestId('kpi-Corrigidos')).toContainText('5');

  const docx = await baixarArquivo(page, 'baixar-docx-corrigido');
  writeFileSync(join(OUT, 'orcamento-escola_corrigido.docx'), docx);
  const zip = await JSZip.loadAsync(docx);
  expect(zip.file('word/comments.xml')).not.toBeNull();
  expect(erros).toEqual([]);
});
