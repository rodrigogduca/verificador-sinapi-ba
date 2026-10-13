// Leitura de PDF (texto nativo via pdf.js; páginas sem texto vão para OCR) e de imagens.
import type { Documento } from '../domain/types';
import type { Progresso } from './index';
import { montarGridPosicional, type Palavra } from './layout';

type PdfJs = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfJs> | undefined;

/** pdf.js: no navegador usa o worker hospedado no próprio site; no Node (testes), o build legacy. */
export function carregarPdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    if (typeof window === 'undefined') {
      return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJs;
    }
    const m = await import('pdfjs-dist');
    m.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}vendor/pdfjs/pdf.worker.min.mjs`;
    return m;
  })();
  return pdfjsPromise;
}

export function opcoesDocumento(bytes: ArrayBuffer) {
  const base = typeof window === 'undefined' ? undefined : `${import.meta.env.BASE_URL}vendor/pdfjs/`;
  return {
    data: new Uint8Array(bytes.slice(0)), // pdf.js transfere o buffer: passa uma cópia
    isEvalSupported: false, // respeita a CSP (sem eval)
    useSystemFonts: false,
    ...(base ? { cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/` } : {}),
  };
}

const MIN_CARACTERES = 20;

export async function lerPdf(nome: string, bytes: ArrayBuffer, progresso: Progresso): Promise<Documento> {
  const pdfjs = await carregarPdfjs();
  const tarefa = pdfjs.getDocument(opcoesDocumento(bytes));
  const pdf = await tarefa.promise;
  const palavras: Palavra[] = [];
  const semTexto: number[] = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      progresso(`Lendo página ${p} de ${pdf.numPages}…`, p / (pdf.numPages + 1));
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      let chars = 0;
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        const [a, b, , d, e, f] = it.transform as number[];
        const altura = Math.abs(it.height || Math.hypot(b, d) || Math.abs(a));
        chars += it.str.trim().length;
        palavras.push({ text: it.str, x0: e, x1: e + it.width, y0: f - altura * 0.2, y1: f + altura * 0.8, page: p });
      }
      if (chars < MIN_CARACTERES) semTexto.push(p);
      page.cleanup();
    }
  } finally {
    await tarefa.destroy();
  }

  let ocr = false;
  if (semTexto.length > 0) {
    const { ocrPaginasPdf } = await import('./ocr');
    palavras.push(...(await ocrPaginasPdf(bytes, semTexto, progresso)));
    ocr = true;
  }
  const grid = montarGridPosicional(palavras, ocr ? 'ocr' : 'pdf', 'Documento');
  const fullText = grid.rows.map((r) => r.map((c) => c.text).filter(Boolean).join(' ')).join('\n');
  return { arquivo: nome, source: ocr ? 'ocr' : 'pdf', grids: [grid], fullText, ocr, bytes, pdfBytes: bytes };
}

export async function lerImagem(nome: string, bytes: ArrayBuffer, progresso: Progresso): Promise<Documento> {
  const { imagemParaPdf, ocrPaginasPdf } = await import('./ocr');
  progresso('Preparando a imagem…', 0.05);
  const pdfBytes = await imagemParaPdf(bytes, nome);
  const palavras = await ocrPaginasPdf(pdfBytes, [1], progresso);
  const grid = montarGridPosicional(palavras, 'ocr', 'Documento');
  const fullText = grid.rows.map((r) => r.map((c) => c.text).filter(Boolean).join(' ')).join('\n');
  return { arquivo: nome, source: 'ocr', grids: [grid], fullText, ocr: true, bytes, pdfBytes };
}
