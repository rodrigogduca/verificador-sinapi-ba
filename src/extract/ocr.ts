import type { Progresso } from './index';
import type { Palavra } from './layout';

export async function ocrPaginasPdf(_bytes: ArrayBuffer, _paginas: number[], _p: Progresso): Promise<Palavra[]> {
  throw new Error('Este PDF não tem texto selecionável (escaneado). OCR disponível na etapa 4.');
}
export async function imagemParaPdf(_bytes: ArrayBuffer, _nome: string): Promise<ArrayBuffer> {
  throw new Error('Leitura de imagens disponível na etapa 4.');
}
