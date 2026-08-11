// Tira prints do próprio manual, para conferir a diagramação sem depender de olho humano.
// Uso: node scripts/_ver-manual.mjs
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = fileURLToPath(new URL('../../deliverables/manual-telas/', import.meta.url));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5 });
await p.goto(pathToFileURL(path.join(BASE, 'manual.html')).href, { waitUntil: 'load' });

// capa
await p.screenshot({ path: path.join(BASE, '_check-capa.png') });
// intro + sumário
await p.evaluate(() => document.querySelector('.intro').scrollIntoView());
await p.waitForTimeout(400);
await p.screenshot({ path: path.join(BASE, '_check-intro.png') });
// uma ficha de tela completa (a primeira que tenha print e tabela de controles)
await p.evaluate(() => {
  const alvo = [...document.querySelectorAll('.tela')].find((t) => t.querySelector('.print') && t.querySelector('table'));
  alvo?.scrollIntoView();
});
await p.waitForTimeout(600);
await p.screenshot({ path: path.join(BASE, '_check-ficha.png') });
// a tabela de controles
await p.evaluate(() => {
  const alvo = [...document.querySelectorAll('.tela')].find((t) => t.querySelector('table'));
  alvo?.querySelector('table')?.scrollIntoView();
});
await p.waitForTimeout(400);
await p.screenshot({ path: path.join(BASE, '_check-tabela.png') });

// A mesma CSS que vira PDF. Sem isto, só se descobre no arquivo final.
await p.emulateMedia({ media: 'print' });
await p.evaluate(() => {
  const alvo = [...document.querySelectorAll('.tela')].find((t) => t.querySelector('.print') && t.querySelector('table'));
  alvo?.scrollIntoView();
});
await p.waitForTimeout(600);
await p.screenshot({ path: path.join(BASE, '_check-impressao.png') });
await b.close();
console.log('prints de conferência em _check-*.png');
