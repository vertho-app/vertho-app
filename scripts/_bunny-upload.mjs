/** Sobe um MP4 no Bunny Stream (library do BUNNY_LIBRARY_ID) e imprime o GUID.
 *  Rodar: node scripts/_bunny-upload.mjs <arquivo.mp4> "<titulo>"
 *  Sem argumentos: lista os vídeos da library (para conferir o que já existe). */
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('='); if (i < 0) continue;
  const k = line.slice(0, i).trim(); if (!k || k.startsWith('#')) continue;
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
}

const LIB = process.env.BUNNY_LIBRARY_ID;
const KEY = process.env.BUNNY_STREAM_API_KEY;
if (!LIB || !KEY) throw new Error('faltam BUNNY_LIBRARY_ID/BUNNY_STREAM_API_KEY no .env.local');
const BASE = `https://video.bunnycdn.com/library/${LIB}`;

const [file, titulo] = process.argv.slice(2);

if (!file) {
  const r = await fetch(`${BASE}/videos?page=1&itemsPerPage=50&orderBy=date`, { headers: { AccessKey: KEY } });
  const { items = [] } = await r.json();
  console.log(`library ${LIB} — ${items.length} vídeo(s):`);
  for (const v of items) {
    console.log(`  ${v.guid}  ${String(v.status).padEnd(2)}  ${String(Math.round(v.length || 0)).padStart(4)}s  ${v.width}x${v.height}  ${v.dateUploaded?.slice(0, 10)}  ${v.title}`);
  }
  process.exit(0);
}

const buf = readFileSync(file);
const cr = await fetch(`${BASE}/videos`, {
  method: 'POST',
  headers: { AccessKey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: titulo || file }),
});
if (!cr.ok) throw new Error(`bunny create ${cr.status}: ${(await cr.text()).slice(0, 300)}`);
const { guid } = await cr.json();
console.log(`criado: ${guid} — enviando ${(buf.length / 1024 / 1024).toFixed(1)} MB…`);

const up = await fetch(`${BASE}/videos/${guid}`, { method: 'PUT', headers: { AccessKey: KEY }, body: buf });
if (!up.ok) throw new Error(`bunny upload ${up.status}: ${(await up.text()).slice(0, 300)}`);
console.log(`PRONTO ✅ GUID = ${guid}  (encoding roda em background — confira o status listando)`);
