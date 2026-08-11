// Gera o PDF do Manual de Telas a partir do manual.html já montado.
// Uso: node scripts/_manual-telas-pdf.mjs
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = fileURLToPath(new URL('../../deliverables/manual-telas/', import.meta.url));
const HTML = path.join(BASE, 'manual.html');
const PDF = path.join(BASE, 'Manual-de-Telas-Vertho.pdf');

if (!existsSync(HTML)) throw new Error('manual.html não existe — rode _montar-manual-telas.mjs antes');

const browser = await chromium.launch();
const page = await browser.newPage();
// pathToFileURL: no Windows, string de caminho com espaço e barra invertida não vira URL sozinha.
await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load', timeout: 120000 });

// `loading="lazy"` deixa a imagem fora do fluxo de impressão: o PDF sai com buracos.
// Força tudo a carregar e só segue quando cada uma terminou de decodificar.
const total = await page.evaluate(async () => {
  const imgs = [...document.querySelectorAll('img')];
  imgs.forEach((i) => { i.loading = 'eager'; });
  await Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => {}))));
  return imgs.length;
});
console.log(`${total} imagens carregadas`);
await page.waitForTimeout(2500);

await page.pdf({
  path: PDF,
  format: 'A4',
  printBackground: true,
  margin: { top: '16mm', bottom: '16mm', left: '13mm', right: '13mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%;font-size:7.5pt;color:#6b7f99;padding:0 13mm;display:flex;'
    + 'justify-content:space-between;font-family:-apple-system,Segoe UI,sans-serif">'
    + '<span>Manual de Telas · Vertho</span>'
    + '<span class="pageNumber"></span></div>',
});
await browser.close();

const mb = (statSync(PDF).size / 1024 / 1024).toFixed(1);
console.log(`PDF gerado: ${PDF} (${mb} MB)`);
