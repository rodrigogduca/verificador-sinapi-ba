import type { Documento } from '../domain/types';
import type { Progresso } from './index';

export async function lerPdf(_nome: string, _bytes: ArrayBuffer, _p: Progresso): Promise<Documento> {
  throw new Error('Leitura de PDF disponível na etapa 2.');
}
export async function lerImagem(_nome: string, _bytes: ArrayBuffer, _p: Progresso): Promise<Documento> {
  throw new Error('Leitura de imagens disponível na etapa 4.');
}
