// Arquivos de teste das etapas 2–4 (PDF, Word, imagem).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { orcamentoDocx } from '../fixtures/generate-docx';
import { orcamentoPdf } from '../fixtures/generate-pdf';

export async function gerarArquivosExtras(dir: string): Promise<void> {
  writeFileSync(join(dir, 'orcamento-escola.pdf'), Buffer.from(await orcamentoPdf({ linhasPorPagina: 7 })));
  writeFileSync(join(dir, 'orcamento-escola.docx'), Buffer.from(await orcamentoDocx()));
}
