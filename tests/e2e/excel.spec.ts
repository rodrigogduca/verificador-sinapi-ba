import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { join } from 'node:path';
import { linhaDoItem } from '../fixtures/generate';
import { ADMIN, ANALISTA, OUT } from './global-setup';
import { baixarArquivo, entrar, vigiarConsole } from './helpers';

test.describe.configure({ mode: 'serial' });

test('login recusa senha errada e não há cadastro público', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('E-mail').fill(ADMIN.email);
  await page.getByLabel('Senha').fill('SenhaErrada123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
  await expect(page.getByText('Não há cadastro público')).toBeVisible();
});

test('admin importa a tabela SINAPI-BA', async ({ page }) => {
  const erros = vigiarConsole(page);
  await entrar(page, ADMIN.email, ADMIN.senha);
  await page.getByRole('tab', { name: 'Tabelas SINAPI' }).click();
  await page.getByTestId('arquivo-sinapi').setInputFiles(join(OUT, 'SINAPI_Referencia_2026_08.xlsx'));
  await expect(page.getByTestId('sinapi-data-base')).toHaveValue('2026-08');
  await page.getByTestId('salvar-sinapi').click();
  await expect(page.getByTestId('sinapi-msg')).toContainText('7 composições e 3 insumos');
  await expect(page.getByTestId('tabelas-sinapi')).toContainText('08/2026');
  expect(erros).toEqual([]);
});

test('verifica o orçamento Excel e baixa a planilha corrigida', async ({ page }) => {
  const erros = vigiarConsole(page);
  await entrar(page, ANALISTA.email, ANALISTA.senha);
  await page.getByTestId('arquivo-orcamento').setInputFiles(join(OUT, 'orcamento-escola.xlsx'));

  // conferência: tudo detectado automaticamente
  await expect(page.getByTestId('resumo-extracao')).toContainText('9 itens');
  await expect(page.getByTestId('data-base')).toHaveValue('2026-08');
  await expect(page.getByTestId('regime')).toHaveValue('nao_desonerado');
  await expect(page.getByTestId('bdi')).toHaveValue('25');
  await page.getByTestId('verificar').click();

  await expect(page.getByTestId('kpi-Corrigidos')).toContainText('5');
  await expect(page.getByTestId('kpi-Revisão manual')).toContainText('2');
  await expect(page.getByTestId('divergencias')).toContainText('Preço unitário divergente');
  await expect(page.getByTestId('divergencias')).toContainText('Possível código errado');

  const corrigido = await baixarArquivo(page, 'baixar-xlsx-corrigido');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(corrigido);
  const ws = wb.getWorksheet('Orçamento')!;
  expect(ws.getCell(`G${linhaDoItem('1.2')}`).value).toBe(41.83);
  expect(wb.getWorksheet('Correções SINAPI')).toBeDefined();

  const relatorio = await baixarArquivo(page, 'baixar-relatorio-pdf');
  expect(relatorio.subarray(0, 4).toString()).toBe('%PDF');
  const relXlsx = await baixarArquivo(page, 'baixar-relatorio-xlsx');
  expect(relXlsx.subarray(0, 2).toString()).toBe('PK');

  // histórico
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.getByTestId('historico')).toContainText('orcamento-escola.xlsx');
  expect(erros).toEqual([]);
});

test('analista não vê importação nem a aba Usuários; admin vê o histórico de todos', async ({ page }) => {
  await entrar(page, ANALISTA.email, ANALISTA.senha);
  await expect(page.getByRole('tab', { name: 'Usuários' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Tabelas SINAPI' }).click();
  await expect(page.getByTestId('arquivo-sinapi')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sair' }).click();

  await entrar(page, ADMIN.email, ADMIN.senha);
  await page.getByRole('tab', { name: 'Usuários' }).click();
  await expect(page.getByTestId('usuarios')).toContainText(ANALISTA.email);
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.getByTestId('historico')).toContainText(ANALISTA.email);
});
