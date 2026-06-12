// Resolve as legendas da V3 e grava a FONTE ÚNICA do vídeo (captions-resolved.json)
// + sidecars SRT/VTT — tudo da MESMA timeline.
//
// Fonte de texto: captions-v3.json (texto EXATO por cena, ligado ao áudio real).
// Timing: captions-timestamps.json se for REAL; senão, proporcional por cena,
//   recortado pela JANELA DE FALA detectada com ffmpeg (corta silêncio de borda).
//
// Rodar: node video-spike/remotion/data/build-captions-v3.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildVideoTimeline, resolveCaptions, exportCaptionsToSrt, exportCaptionsToVtt,
  type CaptionMode, type SceneDef, type TimestampsFile, type SpeechWindow,
} from '../captions/captions-core.ts';

const CAPTION_MODE: CaptionMode = (process.env.CAPTION_MODE as CaptionMode) || 'timestamps';

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, '../../../public/video-spike/assets');
const APP = path.resolve(here, '../../..');
const OUTPUTS = path.join(APP, 'outputs');

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const durations = readJson(path.join(here, 'durations.json')) as Record<string, number | null>;
const scenesJson = readJson(path.join(ASSETS, 'spike-scenes.json'));
const fps = scenesJson.video.fps as number;
const scenes = scenesJson.scenes as SceneDef[];

// DEBUG: fonte de áudio por cena (1 por cena; avatar = embutido no MP4).
const base = (p?: string) => (p ? p.split('/').pop() : '') as string;
scenes.forEach((s, i) => {
  const isAvatar = String(s.type).startsWith('avatar');
  const src = isAvatar ? `embedded: ${base((s as any).file)}` : base((s as any).audio);
  console.log(`Scene ${i + 1} audioSource = ${src}`);
});

// Texto real por cena (captions-v3.json). Sem texto → sem legenda (não mentir).
const v3 = readJson(path.join(ASSETS, 'captions-v3.json')) as { sceneId: string; source: string; text: string }[];
const textByScene: Record<string, string> = Object.fromEntries(v3.map((c) => [c.sceneId, c.text]));

// Timestamps reais (opcional, prioridade).
let timestamps: TimestampsFile | null = null;
const TS_PATH = path.join(ASSETS, 'captions-timestamps.json');
if (existsSync(TS_PATH)) {
  try { timestamps = readJson(TS_PATH) as TimestampsFile; } catch (e) { console.warn('captions-timestamps.json inválido:', (e as Error).message); }
}

// ── Janela de fala por cena via ffmpeg silencedetect (corta silêncio de borda) ──
function speechWindow(srcRel: string | undefined, durKey: string): SpeechWindow | null {
  if (!srcRel) return null;
  const abs = path.join(ASSETS, srcRel.split('/').pop() as string);
  if (!existsSync(abs)) return null;
  const dur = durations[durKey] || 0;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', abs, '-af', 'silencedetect=noise=-32dB:d=0.25', '-f', 'null', '-'], { encoding: 'utf8' });
  const out = (r.stderr || '') + (r.stdout || '');
  if (!out) return null;
  const starts = [...out.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]));
  const ends = [...out.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]));
  let start = 0;
  let end = dur || 0;
  // silêncio inicial?
  if (starts.length && starts[0] <= 0.12 && ends.length) start = ends[0];
  // silêncio final (começa e não termina antes do fim)?
  if (starts.length) {
    const lastStart = starts[starts.length - 1];
    const lastEnd = ends.length ? ends[ends.length - 1] : 0;
    if (lastStart > start && (ends.length < starts.length || lastEnd >= (dur ? dur - 0.15 : lastStart))) end = lastStart;
  }
  if (!(end > start)) return null;
  return { start: Math.max(0, start - 0.05), end: end + 0.05 };
}

const speechWindows: Record<string, SpeechWindow> = {};
let ffmpegOk = false;
for (const s of scenes) {
  const src = (s as any).file || (s as any).audio;
  const key = (src ? src.split('/').pop() : '') as string;
  const w = speechWindow(src, key);
  if (w) { speechWindows[s.id] = w; ffmpegOk = true; }
}
if (!ffmpegOk) console.warn('ffmpeg indisponível/sem detecção — proporcional sobre a cena inteira.');

const timeline = buildVideoTimeline(scenes, durations, fps);
const { captions, source, warnings } = resolveCaptions({
  mode: CAPTION_MODE, timestamps, timeline, textByScene, fps, speechWindows,
  opts: { maxWordsPerCaption: 9, maxDurationSec: 3.5, minDurationSec: 1.0 },
});
warnings.forEach((w) => console.warn('⚠️  ' + w));

const totalFrames = timeline.length ? timeline[timeline.length - 1].endFrame : 0;

mkdirSync(here, { recursive: true });
writeFileSync(path.join(here, 'captions-resolved.json'), JSON.stringify({ mode: CAPTION_MODE, source, fps, totalFrames, captions }, null, 2) + '\n');

mkdirSync(OUTPUTS, { recursive: true });
writeFileSync(path.join(OUTPUTS, 'vertho-video-spike-v3.srt'), exportCaptionsToSrt(captions));
writeFileSync(path.join(OUTPUTS, 'vertho-video-spike-v3.vtt'), exportCaptionsToVtt(captions));

console.log(`captions-resolved.json: ${captions.length} legendas (mode=${CAPTION_MODE}, source=${source}).`);
console.log('→ outputs/vertho-video-spike-v3.srt + .vtt gerados.');
