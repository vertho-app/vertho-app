// Renderiza TODAS as páginas de um PDF em PNG (pdfjs-dist + @napi-rs/canvas).
// Uso: node scripts/_pdf-todas-paginas-png.mjs <arquivo.pdf> <pasta-saida> [escala]
import fs from 'node:fs';
import path from 'node:path';

import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const [pdfPath, outDir, escalaArg] = process.argv.slice(2);
const escala = Number(escalaArg || 2);
fs.mkdirSync(outDir, { recursive: true });

const data = new Uint8Array(fs.readFileSync(pdfPath));
const standardFontDataUrl = path.resolve('node_modules/pdfjs-dist/standard_fonts').replaceAll('\\', '/') + '/';

const doc = await getDocument({
  data, standardFontDataUrl, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true,
}).promise;

const base = path.basename(pdfPath, '.pdf');
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const viewport = page.getViewport({ scale: escala });
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
  const out = path.join(outDir, `${base}-p${String(i).padStart(2, '0')}.png`);
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  console.log('OK', out);
}
console.log(`${doc.numPages} páginas`);
