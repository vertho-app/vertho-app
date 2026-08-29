// INTERNO/descartável: assa o fundo decorativo A4 da capa (sem texto) em PNG 2x.
import path from 'node:path'; import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HTML = 'file:///' + 'C:/Users/rdnav/AppData/Local/Temp/claude/C--GAS-Vertho-App/b66f3c76-9f63-4a7a-a3bd-46ed926462fb/scratchpad/cover-bg.html';
const OUT_DIR = 'C:/GAS/Vertho App/nextjs-app/public/report';
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, 'pdi-cover-bg.png');

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
await p.goto(HTML, { waitUntil: 'networkidle' });
await p.waitForTimeout(400);
await p.locator('.page').screenshot({ path: OUT });
await b.close();
console.log('baked ->', OUT, (fs.statSync(OUT).size / 1024 | 0) + ' KB');
