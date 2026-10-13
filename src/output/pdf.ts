import type { Resultado } from '../domain/types';

export async function gerarPdfAnotado(_bytes: ArrayBuffer, _r: Resultado): Promise<Uint8Array> {
  throw new Error('PDF anotado disponível na etapa 2.');
}
