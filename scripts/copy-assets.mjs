// Copia workers, WASM e dados de idioma para public/vendor, para o site não depender de CDN (RNF7).
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'vendor');

const files = [
  ['tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract/core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract/core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz', 'tesseract/lang/por.traineddata.gz'],
  ['pdfjs-dist/build/pdf.worker.min.mjs', 'pdfjs/pdf.worker.min.mjs'],
];

for (const [from, to] of files) {
  const src = join(nm, from);
  const dst = join(out, to);
  if (!existsSync(src)) throw new Error(`Arquivo não encontrado: ${src}`);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst);
}
for (const dir of ['cmaps', 'standard_fonts']) {
  cpSync(join(nm, 'pdfjs-dist', dir), join(out, 'pdfjs', dir), { recursive: true });
}
console.log('vendor assets copiados para public/vendor');
