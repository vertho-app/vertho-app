// Gera um captions-timestamps.json PROVISÓRIO (aproximação para preview) a partir
// das durações reais dos assets + textos de captions-draft. NÃO sobrescreve um
// arquivo real já existente (source != approximation_for_preview).
//
// Rodar: node video-spike/remotion/data/make-provisional-timestamps.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVideoTimeline, makeProvisionalTimestamps, type SceneDef } from '../captions/captions-core.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, '../../../public/video-spike/assets');
const OUT = path.join(ASSETS, 'captions-timestamps.json');

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const durations = readJson(path.join(here, 'durations.json')) as Record<string, number | null>;
const scenesJson = readJson(path.join(ASSETS, 'spike-scenes.json'));
const draftArr = readJson(path.join(ASSETS, 'captions-draft.json')) as { scene: string; text: string }[];
const draftByScene: Record<string, string> = Object.fromEntries(draftArr.map((d) => [d.scene, d.text]));

if (existsSync(OUT)) {
  try {
    const cur = readJson(OUT);
    if (cur?.source && cur.source !== 'approximation_for_preview') {
      console.log('captions-timestamps.json real detectado (source=' + cur.source + ') — preservado, não sobrescrevo.');
      process.exit(0);
    }
  } catch { /* segue e regenera */ }
}

const fps = scenesJson.video.fps;
const timeline = buildVideoTimeline(scenesJson.scenes as SceneDef[], durations, fps);
const provisional = makeProvisionalTimestamps(timeline, draftByScene);
writeFileSync(OUT, JSON.stringify(provisional, null, 2) + '\n');
console.log('captions-timestamps.json (provisório/aproximação) gerado com', provisional.scenes.length, 'cenas.');
console.log('⚠️  Aproximação para PREVIEW — produção deve usar o export real do TTS.');
