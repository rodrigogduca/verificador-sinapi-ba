// Quais arquivos de saída cada tipo de documento gera (design.md §7).
import type { Documento, Resultado } from '../domain/types';
import { nomeSaida } from './common';

export interface Saida {
  id: string;
  rotulo: string;
  descricao: string;
  nome: string;
  mime: string;
  gerar: () => Promise<Uint8Array>;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function saidasDisponiveis(doc: Documento, r: Resultado): Saida[] {
  const saidas: Saida[] = [];
  if (doc.source === 'xlsx') {
    saidas.push({
      id: 'xlsx-corrigido',
      rotulo: 'Planilha corrigida (.xlsx)',
      descricao: 'Cópia da planilha com valores corrigidos, células coloridas e comentários com o valor original.',
      nome: nomeSaida(doc.arquivo, 'corrigido', 'xlsx'),
      mime: XLSX_MIME,
      gerar: async () => (await import('./excel')).gerarExcelCorrigido(doc.bytes, r),
    });
  }
  if (doc.source === 'docx') {
    saidas.push({
      id: 'docx-corrigido',
      rotulo: 'Documento Word corrigido (.docx)',
      descricao: 'Cópia do documento com valores corrigidos, células sombreadas e comentários do Word.',
      nome: nomeSaida(doc.arquivo, 'corrigido', 'docx'),
      mime: DOCX_MIME,
      gerar: async () => (await import('./docx')).gerarDocxCorrigido(doc.bytes, r),
    });
  }
  if (doc.source === 'pdf' || doc.source === 'ocr') {
    saidas.push({
      id: 'pdf-anotado',
      rotulo: 'PDF anotado (.pdf)',
      descricao: 'PDF original com os pontos errados marcados e comentados, e lista de correções ao final.',
      nome: nomeSaida(doc.arquivo, 'anotado', 'pdf'),
      mime: 'application/pdf',
      gerar: async () => (await import('./pdf')).gerarPdfAnotado(doc.pdfBytes ?? doc.bytes, r),
    });
  }
  if (doc.source !== 'xlsx') {
    saidas.push({
      id: 'xlsx-tabela',
      rotulo: 'Planilha corrigida (.xlsx)',
      descricao: 'Tabela do orçamento extraída do documento, com os valores corrigidos e marcados.',
      nome: nomeSaida(doc.arquivo, 'corrigido', 'xlsx'),
      mime: XLSX_MIME,
      gerar: async () => (await import('./excel')).gerarExcelDeTabela(r),
    });
  }
  saidas.push(
    {
      id: 'relatorio-xlsx',
      rotulo: 'Relatório (.xlsx)',
      descricao: 'Resumo e lista de todas as divergências.',
      nome: nomeSaida(doc.arquivo, 'relatorio', 'xlsx'),
      mime: XLSX_MIME,
      gerar: async () => (await import('./report')).gerarRelatorioExcel(r),
    },
    {
      id: 'relatorio-pdf',
      rotulo: 'Relatório (.pdf)',
      descricao: 'Resumo e lista de todas as divergências, pronto para imprimir ou enviar.',
      nome: nomeSaida(doc.arquivo, 'relatorio', 'pdf'),
      mime: 'application/pdf',
      gerar: async () => (await import('./report')).gerarRelatorioPdf(r),
    },
  );
  return saidas;
}

export function baixar(bytes: Uint8Array, nome: string, mime: string) {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
