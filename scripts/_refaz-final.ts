/**
 * REFAZ SÓ O FINAL: reusa a narração+avatar já gerados de um vídeo e re-renderiza
 * APENAS o segmento do encerramento (últimas cenas) + re-masteriza (bed-pico no
 * clímax + fade-out). Local e barato — não regera narração/avatar.
 *
 * Rodar: npx tsx scripts/_refaz-final.ts
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer';
import { montarInputProps } from '../lib/video/montar-inputprops';
// @ts-ignore
import { masterizarAudio } from '../lib/video/masterizar-audio.mjs';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('='); if (i < 0) continue;
  const k = line.slice(0, i).trim(); if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
}
const LIB = process.env.BUNNY_LIBRARY_ID!, BKEY = process.env.BUNNY_STREAM_API_KEY!;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BUNDLE = path.resolve('spike-bundle');
const SRC_ID = process.env.REFAZ_SRC || 'd64d93c5-5d6d-4e59-88ef-9d4a9a3b022d';
const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function bunny(buf: Buffer, title: string) {
  const cr = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos`, { method: 'POST', headers: { AccessKey: BKEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
  const { guid } = await cr.json();
  await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${guid}`, { method: 'PUT', headers: { AccessKey: BKEY }, body: buf as any });
  return guid;
}

async function main() {
  const { data: v } = await sb.from('videos_gerados').select('roteiro,assets').eq('id', SRC_ID).maybeSingle();
  if (!v?.roteiro || !v?.assets) throw new Error('roteiro/assets ausentes');
  const props: any = montarInputProps(v.roteiro as any, v.assets as any, {});
  const fps = props.fps;
  const outro = props.scenes.find((s: any) => s.type === 'avatar_outro');
  if (!outro) throw new Error('sem avatar_outro');

  const LEAD = 2.6; // segundos antes do outro (mostra o crossfade respiro→pico)
  const clipStart = Math.max(0, outro.fromFrame - Math.round(LEAD * fps));
  const range: [number, number] = [clipStart, props.totalFrames - 1];
  const climaxInClip = (outro.fromFrame - clipStart) / fps;
  log(`outro em ${(outro.fromFrame / fps).toFixed(1)}s · clip frames ${range[0]}-${range[1]} · clímax no clip = ${climaxInClip.toFixed(2)}s`);

  await ensureBrowser();
  const comp = await selectComposition({ serveUrl: BUNDLE, id: 'VerthoVideo', inputProps: props });
  const cru = 'C:/Users/rdnav/Downloads/_final-cru.mp4';
  log('renderizando o segmento do final (720p)…');
  await renderMedia({ serveUrl: BUNDLE, composition: comp, codec: 'h264', outputLocation: cru, concurrency: 4, chromiumOptions: { gl: 'swangle' }, inputProps: props, frameRange: range, scale: 720 / 1080 });

  // masteriza o clip: bed-respiro + bed-pico no clímax + fade-out
  const bedR = path.resolve('public/video-spike/audio/bed-respiro.mp3');
  const bedP = path.resolve('public/video-spike/audio/bed-pico.mp3');
  const master = 'C:/Users/rdnav/Downloads/_final-master.mp4';
  log('masterizando (bed-pico + fade)…');
  await masterizarAudio({ videoIn: cru, bedRespiro: bedR, bedPico: bedP, climaxStartSec: climaxInClip, videoOut: master });

  const guid = await bunny(await readFile(master), 'REFAZ FINAL — encerramento (tail+fade+bed-pico)');
  log('PRONTO → https://iframe.mediadelivery.net/play/' + LIB + '/' + guid);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
