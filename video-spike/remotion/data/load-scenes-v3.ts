import { staticFile } from 'remotion';
import scenesJson from '../../../public/video-spike/assets/spike-scenes.json';
import durations from './durations.json';
import resolved from './captions-resolved.json';
import { buildVideoTimeline, type SceneDef, type AbsCaption } from '../captions/captions-core';
import type { Brand, ComputedScene } from './load-scenes';

// Flags da V3.
export const CAPTION_WORD_HIGHLIGHT = true;
export const SHOW_BURNED_CAPTIONS = true;

export type SpikePropsV3 = {
  scenes: ComputedScene[];
  captions: AbsCaption[];
  brand: Brand;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  showBurnedCaptions: boolean;
  wordHighlight: boolean;
};

function assetUrl(p?: string): string | undefined {
  if (!p) return undefined;
  return staticFile(p.replace(/^\/?video-spike\//, ''));
}

/**
 * Loader V3: a timeline vem do MESMO core usado para gerar o SRT/VTT
 * (buildVideoTimeline) e as legendas vêm de captions-resolved.json (gerado pelo
 * build-captions-v3) — garante que vídeo e sidecars usam a mesma timeline.
 */
export function loadComputedV3(): SpikePropsV3 {
  const v = scenesJson.video;
  const fps = v.fps;
  const timeline = buildVideoTimeline(scenesJson.scenes as unknown as SceneDef[], durations as Record<string, number | null>, fps);
  const tlBy = new Map(timeline.map((t) => [t.sceneId, t]));

  const scenes: ComputedScene[] = (scenesJson.scenes as any[]).map((s) => {
    const tl = tlBy.get(s.id)!;
    return {
      ...s,
      src: assetUrl(s.file || s.audio),
      seconds: tl.durationSec,
      durationInFrames: tl.durationInFrames,
      fromFrame: tl.startFrame,
    } as ComputedScene;
  });

  return {
    scenes,
    captions: (resolved as { captions: AbsCaption[] }).captions,
    brand: v.brand,
    fps,
    width: v.width,
    height: v.height,
    totalFrames: timeline.length ? timeline[timeline.length - 1].endFrame : 0,
    showBurnedCaptions: SHOW_BURNED_CAPTIONS,
    wordHighlight: CAPTION_WORD_HIGHLIGHT,
  };
}
