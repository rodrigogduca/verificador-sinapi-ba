import type { Resultado } from '../domain/types';

export async function gerarDocxCorrigido(_bytes: ArrayBuffer, _r: Resultado): Promise<Uint8Array> {
  throw new Error('Word corrigido disponível na etapa 3.');
}
