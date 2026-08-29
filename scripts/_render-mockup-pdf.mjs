// INTERNO/descartável: renderiza um doc HTML do mockup (.dc.html) pra PDF via
// headless Chromium. O runtime x-import usa fetch() (não funciona em file://),
// então servimos a pasta por HTTP local. Uso: node scripts/_render-mockup-pdf.mjs <arquivo.dc.html> <saida.pdf>
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HTML_DIR = 'C:/Users/rdnav/AppData/Local/Temp/claude/C--GAS-Vertho-App/b66f3c76-9f63-4a7a-a3bd-46ed926462fb/scratchpad/docs-lf';
const file = process.argv[2];
const outName = process.argv[3];
if (!file || !outName) { console.error('uso: <arquivo.dc.html> <saida.pdf>'); process.exit(1); }
const out = path.join(os.homedir(), 'Downloads', outName);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(HTML_DIR, rel);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/${file}`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 160)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
let defined = false;
try { await page.waitForFunction(() => !!customElements.get('doc-page'), { timeout: 25000 }); defined = true; } catch {}
await page.waitForTimeout(3000); // layout de páginas + lucide

const diag = await page.evaluate(() => ({
  docPageDefined: !!customElements.get('doc-page'),
  docPages: document.querySelectorAll('doc-page').length,
  bodyTextLen: (document.body.innerText || '').length,
  scrollH: document.body.scrollHeight,
}));
console.log('DIAG', JSON.stringify(diag));

await page.screenshot({ path: path.join(os.homedir(), 'Downloads', '_verify-cover.png'), clip: { x: 0, y: 0, width: 816, height: 1056 } });
await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true });
await browser.close();
server.close();
console.log('OK ->', out, '| defined:', defined);
