import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer';
import { masterizarAudio } from '../lib/video/masterizar-audio.mjs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const LIB = process.env.BUNNY_LIBRARY_ID, BKEY = process.env.BUNNY_STREAM_API_KEY;
const BUNDLE = path.resolve('build');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function bunny(buf, t) {
  const cr = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos`, { method: 'POST', headers: { AccessKey: BKEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t }) });
  const { guid } = await cr.json();
  await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${guid}`, { method: 'PUT', headers: { AccessKey: BKEY }, body: buf });
  return guid;
}

const props = JSON.parse(await readFile('scripts/_inputprops-pilot.json', 'utf8'));
const fps = props.fps || 30, HOLD = Math.round(1.2 * fps);
let shift = 0;
for (const s of props.scenes) {
  s.fromFrame += shift;
  if (s.id === 'scene-10') { s.hold_silence = true; s.durationInFrames += HOLD; shift += HOLD; }
  if (s.id === 'scene-11') s.is_peak = true;
}
props.totalFrames = (props.totalFrames || 0) + shift;
log('render: voz Vindemiatrix + som + arco. cenas', props.scenes.length, 'totalFrames', props.totalFrames);
await ensureBrowser();
const comp = await selectComposition({ serveUrl: BUNDLE, id: 'VerthoVideo', inputProps: props });
const OUT = 'C:/Users/rdnav/Downloads/deck-PILOTO-render.mp4'; // render cru (voz + SFX)
await renderMedia({ serveUrl: BUNDLE, composition: comp, codec: 'h264', outputLocation: OUT, concurrency: 4, timeoutInMilliseconds: 90000, chromiumOptions: { gl: 'swangle' }, inputProps: props, scale: 720 / 1080 });
log('render cru OK');
// Engenharia de áudio (trilha + ducking + master -14 LUFS) — mesmo passo da worker.
const MASTER = 'C:/Users/rdnav/Downloads/deck-PILOTO-som-voz.mp4';
await masterizarAudio({ videoIn: OUT, bedRespiro: path.resolve('public/video-spike/audio/bed-respiro.mp3'), videoOut: MASTER });
const buf = await readFile(MASTER);
log('master OK', (buf.length / 1e6).toFixed(1) + 'MB');
const guid = await bunny(buf, 'PILOTO som+voz B1 + master');
log('PILOTO som+voz → https://iframe.mediadelivery.net/play/' + LIB + '/' + guid);
