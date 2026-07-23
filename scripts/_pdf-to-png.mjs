// Renderiza a 1ª página de um PDF em PNG (pdfjs-dist + @napi-rs/canvas).
// Uso: node scripts/_pdf-to-png.mjs <arquivo.pdf> <saida.png>
import fs from 'node:fs';
import path from 'node:path';

import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const [pdfPath, outPath] = process.argv.slice(2);
const data = new Uint8Array(fs.readFileSync(pdfPath));
const standardFontDataUrl = path.resolve('node_modules/pdfjs-dist/standard_fonts').replaceAll('\\', '/') + '/';

const doc = await getDocument({
  data,
  standardFontDataUrl,
  useWorkerFetch: false,
  isEvalSupported: false,
  disableFontFace: true,
}).promise;

const page = await doc.getPage(1);
const viewport = page.getViewport({ scale: 2 });
const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
const ctx = canvas.getContext('2d');

await page.render({
  canvasContext: ctx,
  viewport,
  canvasFactory: {
    create: (w, h) => { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; },
    reset: (o, w, h) => { o.canvas.width = w; o.canvas.height = h; },
    destroy: () => {},
  },
}).promise;

fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log('OK', outPath);
