/** Define a capa (thumbnail) de um vídeo do Bunny Stream a partir de um JPG local.
 *  O Bunny só aceita URL pública → hospeda temporariamente no bucket público
 *  `conteudos` do Supabase, manda a URL e apaga o temporário depois.
 *  Rodar: node scripts/_bunny-set-thumb.mjs <capa.jpg> <guid-do-video> */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('='); if (i < 0) continue;
  const k = line.slice(0, i).trim(); if (!k || k.startsWith('#')) continue;
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
}

const LIB = process.env.BUNNY_LIBRARY_ID, KEY = process.env.BUNNY_STREAM_API_KEY;
const [jpgPath, guid] = process.argv.slice(2);
if (!jpgPath || !guid) throw new Error('uso: node scripts/_bunny-set-thumb.mjs <capa.jpg> <guid>');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const tmpPath = `tmp/thumb-${guid}.jpg`;

const up = await sb.storage.from('conteudos').upload(tmpPath, readFileSync(jpgPath), { contentType: 'image/jpeg', upsert: true });
if (up.error) throw new Error(`upload supabase: ${up.error.message}`);
const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(tmpPath);
console.log('capa hospedada em', publicUrl);

const r = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${guid}/thumbnail?thumbnailUrl=${encodeURIComponent(publicUrl)}`, {
  method: 'POST', headers: { AccessKey: KEY },
});
console.log('bunny set-thumbnail:', r.status, (await r.text()).slice(0, 200));

await new Promise((res) => setTimeout(res, 5000));
const chk = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${guid}`, { headers: { AccessKey: KEY } });
const v = await chk.json();
console.log('thumbnailFileName agora:', v.thumbnailFileName);

const del = await sb.storage.from('conteudos').remove([tmpPath]);
console.log('temp removido:', del.error ? del.error.message : 'ok');
