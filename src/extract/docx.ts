import type { Documento } from '../domain/types';

export async function lerDocx(_nome: string, _bytes: ArrayBuffer): Promise<Documento> {
  throw new Error('Leitura de Word disponível na etapa 3.');
}
