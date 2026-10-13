// OCR de páginas escaneadas e imagens (tesseract.js, idioma português, tudo hospedado no próprio site).
import { PDFDocument } from 'pdf-lib';
import type { Progresso } from './index';
import type { Palavra } from './layout';
import { carregarPdfjs, opcoesDocumento } from './pdf';

type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;

let workerPromise: Promise<TesseractWorker> | undefined;
let ouvinte: ((fracao: number) => void) | undefined;

async function obterWorker(): Promise<TesseractWorker> {
  workerPromise ??= (async () => {
    const { createWorker, OEM, PSM } = await import('tesseract.js');
    const base = `${import.meta.env.BASE_URL}vendor/tesseract`;
    const w = await createWorker('por', OEM.LSTM_ONLY, {
      workerPath: `${base}/worker.min.js`,
      corePath: `${base}/core`,
      langPath: `${base}/lang`,
      workerBlobURL: false,
      gzip: true,
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') ouvinte?.(m.progress);
      },
    });
    // tabelas: texto esparso com posição de cada palavra
    await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' });
    return w;
  })();
  try {
    return await workerPromise;
  } catch (e) {
    workerPromise = undefined;
    throw e;
  }
}

/** Renderiza as páginas indicadas e devolve as palavras reconhecidas em coordenadas PDF. */
export async function ocrPaginasPdf(bytes: ArrayBuffer, paginas: number[], progresso: Progresso): Promise<Palavra[]> {
  if (typeof document === 'undefined') throw new Error('OCR disponível apenas no navegador.');
  progresso('Preparando o reconhecimento de texto (OCR)…', 0.05);
  const worker = await obterWorker();
  const pdfjs = await carregarPdfjs();
  const tarefa = pdfjs.getDocument(opcoesDocumento(bytes));
  const pdf = await tarefa.promise;
  const palavras: Palavra[] = [];
  try {
    for (const [i, p] of paginas.entries()) {
      const page = await pdf.getPage(p);
      const base = page.getViewport({ scale: 1 });
      // ~2.500 px de largura: bom equilíbrio entre precisão e tempo
      const scale = Math.min(4.2, Math.max(1.5, 2500 / base.width));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      const rotulo = `Reconhecendo texto (OCR) — página ${p}${paginas.length > 1 ? ` (${i + 1} de ${paginas.length})` : ''}…`;
      ouvinte = (f) => progresso(rotulo, (i + f) / paginas.length);
      progresso(rotulo, i / paginas.length);
      // resolução real da imagem renderizada (evita a estimativa do tesseract)
      await worker.setParameters({ user_defined_dpi: String(Math.round(72 * scale)) });
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      ouvinte = undefined;

      for (const b of data.blocks ?? []) {
        for (const par of b.paragraphs) {
          for (const linha of par.lines) {
            for (const w of linha.words) {
              const t = w.text.trim();
              if (!t) continue;
              const [xa, ya] = viewport.convertToPdfPoint(w.bbox.x0, w.bbox.y1);
              const [xb, yb] = viewport.convertToPdfPoint(w.bbox.x1, w.bbox.y0);
              palavras.push({
                text: t,
                x0: Math.min(xa, xb), x1: Math.max(xa, xb),
                y0: Math.min(ya, yb), y1: Math.max(ya, yb),
                page: p,
                confidence: w.confidence,
              });
            }
          }
        }
      }
      canvas.width = canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await tarefa.destroy();
  }
  return palavras;
}

/** Converte JPG/PNG em um PDF de uma página (para anotar e para seguir o mesmo fluxo do PDF escaneado). */
export async function imagemParaPdf(bytes: ArrayBuffer, nome: string): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const b = new Uint8Array(bytes);
  const png = b[0] === 0x89 && b[1] === 0x50;
  const jpg = b[0] === 0xff && b[1] === 0xd8;
  if (!png && !jpg) throw new Error(`"${nome}" não é uma imagem PNG ou JPG válida.`);
  const img = png ? await doc.embedPng(b) : await doc.embedJpg(b);
  // 150 dpi: 1 px = 0,48 pt
  const w = img.width * 0.48;
  const h = img.height * 0.48;
  const page = doc.addPage([w, h]);
  page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  const out = await doc.save();
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}
