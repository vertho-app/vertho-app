// Pré-calcula a duração REAL de cada asset (vídeo/áudio) lendo o container com
// @remotion/media-parser (isomórfico, sem ffmpeg). Roda no Node ANTES do
// studio/render — evita usar APIs de DOM dentro de calculateMetadata. Grava
// durations.json, consumido por load-scenes.ts.
import { parseMedia } from '@remotion/media-parser';
import { nodeReader } from '@remotion/media-parser/node';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, '../../../public/video-spike/assets');

const FILES = [
  'avatar-intro.mp4',
  'avatar-outro.mp4',
  'audio-scene-2-concept.mp3',
  'audio-scene-3-comparison.mp3',
  'audio-scene-4-signals.mp3',
];

const out = {};
for (const f of FILES) {
  try {
    const { durationInSeconds, slowDurationInSeconds } = await parseMedia({
      src: path.join(ASSETS, f),
      reader: nodeReader,
      fields: { durationInSeconds: true, slowDurationInSeconds: true },
      acknowledgeRemotionLicense: true,
    });
    const dur = (typeof durationInSeconds === 'number' && durationInSeconds > 0)
      ? durationInSeconds
      : slowDurationInSeconds;
    out[f] = Math.round((dur || 0) * 1000) / 1000;
    console.log(f.padEnd(34), out[f] + 's');
  } catch (e) {
    console.error('FALHA', f, e?.message);
    out[f] = null;
  }
}

writeFileSync(path.join(here, 'durations.json'), JSON.stringify(out, null, 2) + '\n');
console.log('→ durations.json gravado');
