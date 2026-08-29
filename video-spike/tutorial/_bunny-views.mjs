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
const guid = process.argv[2];

const v = await (await fetch('https://video.bunnycdn.com/library/' + LIB + '/videos/' + guid, {
  headers: { AccessKey: KEY, Accept: 'application/json' },
})).json();
console.log('título        :', v.title);
console.log('criado (UTC)  :', v.dateUploaded);
console.log('views         :', v.views);
console.log('storage/mês   :', v.storageSize);
console.log('watch time (s):', v.averageWatchTime, '(médio) ·', v.totalWatchTime, '(total)');

const st = await (await fetch(
  'https://video.bunnycdn.com/library/' + LIB + '/statistics?videoGuid=' + guid,
  { headers: { AccessKey: KEY, Accept: 'application/json' } },
)).json();
const porDia = st?.viewsChart || {};
const comView = Object.entries(porDia).filter(([, n]) => n > 0);
console.log('série de views:', comView.length ? JSON.stringify(Object.fromEntries(comView)) : '(vazia)');
console.log('watchtime/dia :', JSON.stringify(
  Object.fromEntries(Object.entries(st?.watchTimeChart || {}).filter(([, n]) => n > 0)),
));
