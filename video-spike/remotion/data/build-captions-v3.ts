// Resolve as legendas da V3 (timestamps reais OU fallback proporcional) e grava
// a FONTE ÚNICA usada pelo vídeo (captions-resolved.json) + os sidecars SRT/VTT.
// Assim vídeo e legendas externas saem da MESMA timeline.
//
// Rodar: node video-spike/remotion/data/build-captions-v3.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildVideoTimeline, resolveCaptions, exportCaptionsToSrt, exportCaptionsToVtt,
  type CaptionMode, type SceneDef, type TimestampsFile,
} from '../captions/captions-core.ts';

// Config — default da V3.
const CAPTION_MODE: CaptionMode = (process.env.CAPTION_MODE as CaptionMode) || 'timestamps';

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, '../../../public/video-spike/assets');
const APP = path.resolve(here, '../../..'); // nextjs-app
const OUTPUTS = path.join(APP, 'outputs');

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const durations = readJson(path.join(here, 'durations.json')) as Record<string, number | null>;
const scenesJson = readJson(path.join(ASSETS, 'spike-scenes.json'));
const draftArr = readJson(path.join(ASSETS, 'captions-draft.json')) as { scene: string; text: string }[];
const draftByScene: Record<string, string> = Object.fromEntries(draftArr.map((d) => [d.scene, d.text]));

let timestamps: TimestampsFile | null = null;
const TS_PATH = path.join(ASSETS, 'captions-timestamps.json');
if (existsSync(TS_PATH)) {
  try { timestamps = readJson(TS_PATH) as TimestampsFile; }
  catch (e) { console.warn('captions-timestamps.json inválido:', (e as Error).message); }
} else if (CAPTION_MODE === 'timestamps') {
  console.warn('captions-timestamps.json não encontrado; usando fallback proporcional (apenas preview).');
}

const fps = scenesJson.video.fps;
const timeline = buildVideoTimeline(scenesJson.scenes as SceneDef[], durations, fps);
const { captions, source, warnings } = resolveCaptions({
  mode: CAPTION_MODE, timestamps, timeline, draftByScene, fps,
  opts: { maxWordsPerCaption: 9, maxDurationSec: 3.5, minDurationSec: 1.0 },
});
warnings.forEach((w) => console.warn('⚠️  ' + w));

const totalFrames = timeline.length ? timeline[timeline.length - 1].endFrame : 0;

// Fonte única consumida pelo vídeo (e que casa com o SRT/VTT).
mkdirSync(path.join(here), { recursive: true });
writeFileSync(path.join(here, 'captions-resolved.json'), JSON.stringify({ mode: CAPTION_MODE, source, fps, totalFrames, captions }, null, 2) + '\n');

// Sidecars (mesma timeline).
mkdirSync(OUTPUTS, { recursive: true });
writeFileSync(path.join(OUTPUTS, 'vertho-video-spike-v3.srt'), exportCaptionsToSrt(captions));
writeFileSync(path.join(OUTPUTS, 'vertho-video-spike-v3.vtt'), exportCaptionsToVtt(captions));

console.log(`captions-resolved.json: ${captions.length} legendas (mode=${CAPTION_MODE}, source=${source}).`);
console.log('→ outputs/vertho-video-spike-v3.srt + .vtt gerados.');
