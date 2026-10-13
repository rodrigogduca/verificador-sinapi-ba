import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { join } from 'node:path';
import { ADMIN, OUT } from './global-setup';
import { baixarArquivo, entrar, vigiarConsole } from './helpers';

test('verifica orçamento em PDF com texto e baixa o PDF anotado', async ({ page }) => {
  const erros = vigiarConsole(page);
  await entrar(page, ADMIN.email, ADMIN.senha);
  // garante a tabela SINAPI (o teste pode rodar isolado)
  await page.getByRole('tab', { name: 'Tabelas SINAPI' }).click();
  if (!(await page.getByTestId('tabelas-sinapi').getByText('08/2026').count())) {
    await page.getByTestId('arquivo-sinapi').setInputFiles(join(OUT, 'SINAPI_Referencia_2026_08.xlsx'));
    await page.getByTestId('salvar-sinapi').click();
    await expect(page.getByTestId('sinapi-msg')).toBeVisible();
  }
  await page.getByRole('tab', { name: 'Verificar orçamento' }).click();
  await page.getByTestId('arquivo-orcamento').setInputFiles(join(OUT, 'orcamento-escola.pdf'));
  await expect(page.getByTestId('resumo-extracao')).toContainText('9 itens');
  await page.getByTestId('verificar').click();
  await expect(page.getByTestId('kpi-Corrigidos')).toContainText('5');

  const anotado = await baixarArquivo(page, 'baixar-pdf-anotado');
  const pdf = await PDFDocument.load(anotado);
  expect(pdf.getPageCount()).toBeGreaterThan(2);
  const xlsx = await baixarArquivo(page, 'baixar-xlsx-tabela');
  expect(xlsx.subarray(0, 2).toString()).toBe('PK');
  expect(erros).toEqual([]);
});
