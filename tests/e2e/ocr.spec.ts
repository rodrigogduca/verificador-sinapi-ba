import { expect, test, type Browser } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { calcularLinha, ORCAMENTO } from '../fixtures/generate';
import { totaisEtapas } from '../fixtures/generate-pdf';
import { ADMIN, OUT } from './global-setup';
import { baixarArquivo, entrar, vigiarConsole } from './helpers';

const br = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** "Escaneia" o orçamento: renderiza uma tabela HTML e tira uma foto (PNG), sem camada de texto. */
async function escanear(browser: Browser): Promise<Buffer> {
  const { etapas, geral } = totaisEtapas();
  let e = -1;
  const linhas = ORCAMENTO.map((l) => {
    if (l.titulo) {
      e++;
      return `<tr><td><b>${l.item}</b></td><td></td><td></td><td><b>${esc(l.descricao)}</b></td><td></td><td></td><td></td><td></td><td class="n"><b>${br(etapas[e])}</b></td></tr>`;
    }
    const { pub, total } = calcularLinha(l);
    return `<tr><td>${l.item}</td><td>${l.codigo}</td><td>${l.fonte}</td><td>${esc(l.descricao)}</td><td>${l.und}</td><td class="n">${br(l.qtd!)}</td><td class="n">${br(l.pu!)}</td><td class="n">${br(pub)}</td><td class="n">${br(total)}</td></tr>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font:16px Arial,sans-serif;margin:30px;color:#000;background:#fff}
    table{border-collapse:collapse;width:100%} td,th{padding:6px 10px;vertical-align:top;text-align:left}
    th{border-bottom:2px solid #000} .n{text-align:right;white-space:nowrap} td:nth-child(4){width:430px}
  </style></head><body>
  <h2>PREFEITURA MUNICIPAL DE EXEMPLO</h2>
  <p>Referência: SINAPI-BA 08/2026 - Não desonerado &nbsp;&nbsp; BDI: 25,00%</p>
  <table><tr><th>Item</th><th>Código</th><th>Fonte</th><th>Descrição</th><th>Und</th><th class="n">Quant.</th><th class="n">P. Unit.</th><th class="n">P. Unit. c/ BDI</th><th class="n">Total</th></tr>
  ${linhas}
  <tr><td></td><td></td><td></td><td><b>TOTAL GERAL</b></td><td></td><td></td><td></td><td></td><td class="n"><b>${br(geral)}</b></td></tr></table>
  </body></html>`;
  const p = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1.5 });
  await p.setContent(html);
  const png = await p.screenshot({ fullPage: true });
  await p.close();
  return png;
}

async function pdfEscaneado(png: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(png);
  const page = doc.addPage([img.width * 0.5, img.height * 0.5]);
  page.drawImage(img, { x: 0, y: 0, width: img.width * 0.5, height: img.height * 0.5 });
  return Buffer.from(await doc.save());
}

test.describe.configure({ mode: 'serial', timeout: 300_000 });

for (const formato of ['png', 'pdf'] as const) {
  test(`OCR: orçamento escaneado (${formato}) é lido, verificado e anotado`, async ({ page, browser }) => {
    const erros = vigiarConsole(page);
    const png = await escanear(browser);
    const arquivo = join(OUT, `orcamento-escaneado.${formato}`);
    writeFileSync(arquivo, formato === 'png' ? png : await pdfEscaneado(png));

    await entrar(page, ADMIN.email, ADMIN.senha);
    await page.getByRole('tab', { name: 'Tabelas SINAPI' }).click();
    if (!(await page.getByTestId('tabelas-sinapi').getByText('08/2026').count())) {
      await page.getByTestId('arquivo-sinapi').setInputFiles(join(OUT, 'SINAPI_Referencia_2026_08.xlsx'));
      await page.getByTestId('salvar-sinapi').click();
      await expect(page.getByTestId('sinapi-msg')).toBeVisible();
    }
    await page.getByRole('tab', { name: 'Verificar orçamento' }).click();
    await page.getByTestId('arquivo-orcamento').setInputFiles(arquivo);

    await expect(page.getByText('foi lido por OCR')).toBeVisible({ timeout: 240_000 });
    await expect(page.getByTestId('resumo-extracao')).toContainText('9 itens');
    await expect(page.getByTestId('data-base')).toHaveValue('2026-08');
    await page.getByTestId('verificar').click();

    await expect(page.getByTestId('resumo')).toBeVisible();
    await expect(page.getByTestId('divergencias')).toContainText('Preço unitário divergente');
    await expect(page.getByTestId('divergencias')).toContainText('R$ 41,83');

    const anotado = await baixarArquivo(page, 'baixar-pdf-anotado');
    expect((await PDFDocument.load(anotado)).getPageCount()).toBeGreaterThan(1);
    expect(erros).toEqual([]);
  });
}
