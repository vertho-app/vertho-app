/**
 * Rasteriza um PDF em PNGs (uma imagem por página) usando pdfjs-dist + @napi-rs/canvas.
 * Uso: node scripts/pdf-to-png.mjs <input.pdf> <outDir> [scale]
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const [, , inPath, outDir, scaleArg] = process.argv;
const scale = Number(scaleArg) || 2;
mkdirSync(outDir, { recursive: true });

const data = new Uint8Array(readFileSync(inPath));
const doc = await pdfjs.getDocument({ data, disableFontFace: true }).promise;
console.log(`páginas: ${doc.numPages}`);

for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const out = path.join(outDir, `page-${String(n).padStart(2, '0')}.png`);
  writeFileSync(out, canvas.toBuffer('image/png'));
  console.log(`  -> ${out}`);
}
