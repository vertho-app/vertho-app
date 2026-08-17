// Procura um termo no texto de TODAS as páginas de um ou mais PDFs.
// Uso: node scripts/_pdf-buscar-texto.mjs <termo> <a.pdf> [b.pdf ...]
//
// Serve para provar ausência de marca no ARTEFATO final — o teste unitário
// olha a árvore React, este olha o PDF que a pessoa recebe.
import fs from 'node:fs';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const [termo, ...arquivos] = process.argv.slice(2);
if (!termo || !arquivos.length) {
  console.error('uso: <termo> <a.pdf> [b.pdf ...]');
  process.exit(1);
}
const standardFontDataUrl = path.resolve('node_modules/pdfjs-dist/standard_fonts').replaceAll('\\', '/') + '/';
const re = new RegExp(termo, 'i');

for (const arq of arquivos) {
  const doc = await getDocument({
    data: new Uint8Array(fs.readFileSync(arq)),
    standardFontDataUrl, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true,
  }).promise;

  const achados = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const txt = (await page.getTextContent()).items.map((i) => i.str).join(' ');
    if (re.test(txt)) {
      const trechos = txt.split(/\s{2,}|·/).filter((t) => re.test(t)).map((t) => t.trim());
      achados.push(`p.${p}: ${[...new Set(trechos)].join(' | ').slice(0, 120)}`);
    }
  }
  const nome = path.basename(arq);
  if (achados.length) {
    console.log(`❌ ${nome} — ${doc.numPages} páginas, "${termo}" em ${achados.length}:`);
    achados.forEach((a) => console.log(`     ${a}`));
  } else {
    console.log(`✅ ${nome} — ${doc.numPages} páginas, nenhuma ocorrência de "${termo}"`);
  }
}
