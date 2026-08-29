// Troca UM vídeo no Bunny: apaga o guid antigo e sobe o arquivo de novo.
// O guid NOVO é impresso no fim — quem aponta pra ele precisa ser atualizado.
// Uso: node video-spike/tutorial/_bunny-troca.mjs <guidAntigo> <arquivo> <titulo>
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = {};
for (const line of readFileSync(path.join(APP, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const LIB = env.BUNNY_LIBRARY_ID;
const KEY = env.BUNNY_STREAM_API_KEY;
const API = 'https://video.bunnycdn.com/library/' + LIB + '/videos';

const [guidAntigo, rel, titulo] = process.argv.slice(2);
if (!guidAntigo || !rel || !titulo) throw new Error('uso: _bunny-troca.mjs <guidAntigo> <arquivo> <titulo>');

const d = await fetch(API + '/' + guidAntigo, { method: 'DELETE', headers: { AccessKey: KEY } });
console.log('DELETE ' + guidAntigo + ' -> ' + d.status);

const cr = await fetch(API, {
  method: 'POST',
  headers: { AccessKey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: titulo }),
});
if (!cr.ok) throw new Error('create ' + cr.status);
const { guid } = await cr.json();

const buf = readFileSync(path.join(APP, rel));
const up = await fetch(API + '/' + guid, { method: 'PUT', headers: { AccessKey: KEY }, body: buf });
if (!up.ok) throw new Error('upload ' + up.status + ': ' + (await up.text()).slice(0, 200));
console.log('OK ' + titulo + ' (' + (buf.length / 1e6).toFixed(1) + ' MB)');
console.log('GUID NOVO: ' + guid);
