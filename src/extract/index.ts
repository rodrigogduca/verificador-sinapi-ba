// Ponto de entrada da extração: escolhe o leitor pelo tipo do arquivo e monta o Orçamento.
import type { Documento, Grid, Mapeamento, Metadados, Orcamento } from '../domain/types';
import { lerExcel } from './excel';
import { extrairMetadados } from './metadata';
import { detectarMapeamento, escolherGrid, extrairLinhas } from './table';

export const TAMANHO_MAXIMO = 50 * 1024 * 1024;

export type TipoArquivo = 'excel' | 'pdf' | 'docx' | 'imagem';

export function tipoDoArquivo(nome: string): TipoArquivo | undefined {
  const ext = nome.toLowerCase().split('.').pop() ?? '';
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') return 'excel';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'imagem';
  return undefined;
}

export const FORMATOS_ACEITOS = '.xlsx, .xls, .xlsm, .pdf, .docx, .png, .jpg, .jpeg';

export interface Progresso {
  (etapa: string, fracao?: number): void;
}

export async function lerDocumento(nome: string, bytes: ArrayBuffer, progresso: Progresso = () => {}): Promise<Documento> {
  if (bytes.byteLength > TAMANHO_MAXIMO) throw new Error('Arquivo maior que 50 MB.');
  const tipo = tipoDoArquivo(nome);
  progresso('Lendo o documento…');
  switch (tipo) {
    case 'excel':
      return lerExcel(nome, bytes);
    case 'pdf': {
      const { lerPdf } = await import('./pdf');
      return lerPdf(nome, bytes, progresso);
    }
    case 'docx': {
      const { lerDocx } = await import('./docx');
      return lerDocx(nome, bytes);
    }
    case 'imagem': {
      const { lerImagem } = await import('./pdf');
      return lerImagem(nome, bytes, progresso);
    }
    default:
      throw new Error(`Formato não suportado. Formatos aceitos: ${FORMATOS_ACEITOS}.`);
  }
}

export interface Preparacao {
  indiceGrid: number;
  mapeamento?: Mapeamento;
  meta: Metadados;
}

/** Escolha automática do grid, do mapeamento e dos metadados. */
export function prepararAutomatico(doc: Documento): Preparacao {
  const { indice, mapeamento } = escolherGrid(doc.grids);
  const meta = extrairMetadados(doc.fullText);
  return { indiceGrid: indice, mapeamento, meta };
}

export function montarOrcamento(doc: Documento, grid: Grid, mapeamento: Mapeamento, meta: Metadados): Orcamento {
  return { arquivo: doc.arquivo, grid, mapeamento, linhas: extrairLinhas(grid, mapeamento), meta, ocr: doc.ocr };
}

export { detectarMapeamento };
