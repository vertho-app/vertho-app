import { staticFile } from 'remotion';
import scenesJson from '../../../public/video-spike/assets/spike-scenes.json';
import captionsJson from '../../../public/video-spike/assets/captions-draft.json';
import durations from './durations.json';
import { buildCaptionTimeline, CaptionCue, RawCaption } from '../utils/captions';

export type SceneType =
  | 'avatar_intro'
  | 'concept_reveal'
  | 'comparison_motion'
  | 'icon_story'
  | 'stat_highlight'
  | 'quote_spotlight'
  | 'steps_flow'
  | 'scenario_card'
  | 'maturity_ladder'
  | 'myth_truth'
  | 'definition_card'
  | 'reflection_prompt'
  | 'avatar_outro';

export interface Brand {
  primary: string;
  secondary: string;
  background: string;
  font?: string;
}

// ⚠️ MIRROR — shape do render_inputprops, espelhado em
// `lib/video/montar-inputprops.ts` (ComputedScene). Projetos TS separados de
// propósito (bundle standalone) → sem tipo compartilhado. Mudou aqui, replique lá.
export interface ComputedScene {
  id: string;
  type: SceneType;
  title?: string;
  subtitle?: string;
  bullets?: string[];
  items?: string[];
  icons?: string[]; // nomes semânticos (vocabulário em ../icons) por bullet/item
  left?: { title: string; items: string[] };
  right?: { title: string; items: string[] };
  stat?: string;
  quote?: string;
  rungs?: string[];
  target?: number;
  myth?: string;
  truth?: string;
  term?: string;
  definition?: string;
  prompt?: string;
  tag?: string;
  src?: string;
  audioSrc?: string; // avatar: áudio (mp3) separado do vídeo (mp4 mutado) p/ lip-sync preciso
  // M4 — janela de FALA real (frames relativos à cena, do Whisper) p/ sincronizar
  // as animações com a voz. Ausente = fallback p/ staggerDelay.
  speechStartFrame?: number;
  speechEndFrame?: number;
  // ARCO DRAMÁTICO (peak-end) — archetype-level (entram no deck_invariant; nunca
  // DISC/person-sensitive). 1 tag dramatúrgico orquestra escala + som + ritmo.
  beat?: 'reconhecimento' | 'virada' | 'transformacao';
  is_peak?: boolean;      // a ÚNICA cena de pico (~75-80%): escala (e, no som, trilha) crescem
  hold_silence?: boolean; // respiro/silêncio (tipicamente a cena imediatamente antes do pico)
  seconds: number;
  durationInFrames: number;
  fromFrame: number;
}

// `type` (não `interface`): o Composition do Remotion exige props atribuíveis a
// Record<string, unknown> — interfaces não satisfazem isso, type aliases sim.
export type SpikeProps = {
  scenes: ComputedScene[];
  captions: CaptionCue[];
  brand: Brand;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
};

/** Resolve o asset para staticFile (publicDir = public/video-spike). */
function assetUrl(p?: string): string | undefined {
  if (!p) return undefined;
  return staticFile(p.replace(/^\/?video-spike\//, ''));
}

function basename(p?: string): string {
  return p ? p.split('/').pop() || '' : '';
}

const DUR = durations as Record<string, number | null>;

/** Duração real (do probe) com fallback seguro. */
function secondsFor(scene: any): number {
  const key = basename(scene.file || scene.audio);
  const d = DUR[key];
  if (typeof d === 'number' && d > 0) return d;
  return String(scene.type).startsWith('avatar') ? 6 : 8;
}

/** Lê tudo, calcula durações em frames e offsets cumulativos. */
export function loadComputed(): SpikeProps {
  const v = scenesJson.video;
  const fps = v.fps;
  let cursor = 0;

  const scenes: ComputedScene[] = scenesJson.scenes.map((s: any) => {
    const seconds = secondsFor(s);
    // Avatar = duração exata do vídeo. Áudio = áudio + leve respiro p/ a
    // animação e a última legenda assentarem.
    const tail = String(s.type).startsWith('avatar') ? 0 : 0.3;
    const durationInFrames = Math.max(1, Math.round((seconds + tail) * fps));
    const out: ComputedScene = {
      ...s,
      src: assetUrl(s.file || s.audio),
      seconds,
      durationInFrames,
      fromFrame: cursor,
    };
    cursor += durationInFrames;
    return out;
  });

  const captions = buildCaptionTimeline(
    scenes.map((s) => ({ id: s.id, fromFrame: s.fromFrame, durationInFrames: s.durationInFrames })),
    captionsJson as RawCaption[],
    fps,
  );

  return {
    scenes,
    captions,
    brand: v.brand,
    fps,
    width: v.width,
    height: v.height,
    totalFrames: cursor,
  };
}
