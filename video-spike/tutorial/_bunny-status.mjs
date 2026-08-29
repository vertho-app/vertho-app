import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = {};
for (const line of readFileSync(path.join(APP, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const guid = process.argv[2];
const url = 'https://video.bunnycdn.com/library/' + env.BUNNY_LIBRARY_ID + '/videos/' + guid;

for (let i = 0; i < 30; i++) {
  const hora = new Date().toISOString().slice(11, 19);
  try {
    const r = await fetch(url, { headers: { AccessKey: env.BUNNY_STREAM_API_KEY, Accept: 'application/json' } });
    const txt = await r.text();
    let v = null;
    try { v = JSON.parse(txt); } catch { console.log(hora + ' http=' + r.status + ' resposta não-JSON: ' + txt.slice(0, 80)); }
    if (v) {
      console.log(hora + ' status=' + v.status + ' prog=' + v.encodeProgress + ' len=' + v.length);
      if (v.status >= 4) { console.log(v.status === 4 ? 'PRONTO' : 'ERRO status=' + v.status); break; }
    }
  } catch (e) {
    console.log(hora + ' falha de rede: ' + (e?.message || e));
  }
  await new Promise((r) => setTimeout(r, 20000));
}
