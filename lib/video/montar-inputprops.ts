/**
 * Monta os inputProps do Remotion (produto) a partir do ROTEIRO + ASSETS remotos.
 * Autocontido (sem staticFile, sem JSON estático, sem dependência do spike) para
 * ser portável ao worker do trigger.dev. Espelha o SpikePropsV3 do spike, mas com
 * `src` = URL pública (mp4 do avatar / mp3 das demais cenas) e timeline computada
 * a partir das durações reais (ffprobe), com legendas PROPORCIONAIS.
 */
import type { RoteiroScene, VideoRoteiro } from './roteiro-prompt';

export interface Brand { primary: string; secondary: string; background: string; font?: string }

export interface ComputedScene {
  id: string;
  type: RoteiroScene['type'];
  title?: string;
  subtitle?: string;
  bullets?: string[];
  items?: string[];
  left?: { title: string; items: string[] };
  right?: { title: string; items: string[] };
  src?: string;
  seconds: number;
  durationInFrames: number;
  fromFrame: number;
}

export interface AbsCaption {
  id: number; sceneId: string; startSec: number; endSec: number;
  startFrame: number; endFrame: number; text: string;
}

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

/** Asset (URL + duração real) de cada cena, indexado por sceneId. */
export type AssetMap = Record<string, { src: string; durationSec: number }>;

export const BRAND_PADRAO: Brand = {
  primary: '#6D28D9', secondary: '#0EA5E9', background: '#0B1020', font: 'Inter, system-ui, sans-serif',
};

const AUDIO_TAIL_SEC = 0.3;

function isAvatar(type: string): boolean { return type.startsWith('avatar'); }

/** Legendas proporcionais ao tamanho do texto, sempre dentro da cena. */
function captionsDaCena(
  sceneId: string, text: string, startFrame: number, endFrame: number, fps: number, startId: number,
  opts: { maxWords: number; maxDur: number; minDur: number },
): AbsCaption[] {
  const caps: AbsCaption[] = [];
  let id = startId;
  const span = Math.max(1, endFrame - startFrame);
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g)?.map((s) => s.trim()) || [text];
  const totalChars = sentences.reduce((a, s) => a + s.length, 0) || 1;
  let f = startFrame;
  sentences.forEach((sentence, si) => {
    const last = si === sentences.length - 1;
    const sentFrames = last ? endFrame - f : Math.round(span * (sentence.length / totalChars));
    const sentStart = f;
    const sentEnd = Math.min(endFrame, f + sentFrames);
    f = sentEnd;
    const words = sentence.split(/\s+/);
    const k = Math.max(1, Math.ceil(words.length / opts.maxWords), Math.ceil((sentEnd - sentStart) / (opts.maxDur * fps)));
    const wper = Math.ceil(words.length / k);
    let g = sentStart;
    for (let i = 0; i < k; i++) {
      const chunk = words.slice(i * wper, (i + 1) * wper);
      if (!chunk.length) break;
      const isLast = i === k - 1 || (i + 1) * wper >= words.length;
      const cEnd = isLast ? sentEnd : Math.min(sentEnd, g + Math.round((sentEnd - sentStart) / k));
      const ef = Math.min(sentEnd, Math.max(g + Math.round(opts.minDur * fps), cEnd));
      caps.push({ id: id++, sceneId, startSec: g / fps, endSec: ef / fps, startFrame: g, endFrame: ef, text: chunk.join(' ') });
      g = ef;
      if (isLast) break;
    }
  });
  return caps;
}

/** Roteiro + assets → SpikePropsV3 (timeline + legendas computadas). */
export function montarInputProps(
  roteiro: VideoRoteiro,
  assets: AssetMap,
  opts: { brand?: Brand; fps?: number; width?: number; height?: number; showBurnedCaptions?: boolean; wordHighlight?: boolean } = {},
): SpikePropsV3 {
  const fps = opts.fps ?? 30;
  const brand = { ...BRAND_PADRAO, ...opts.brand };
  const capOpts = { maxWords: 9, maxDur: 3.5, minDur: 1.0 };

  let cursor = 0;
  let capId = 1;
  const captions: AbsCaption[] = [];

  const scenes: ComputedScene[] = roteiro.scenes.map((s) => {
    const asset = assets[s.id];
    const seconds = asset?.durationSec && asset.durationSec > 0 ? asset.durationSec : (isAvatar(s.type) ? 6 : 8);
    const tail = isAvatar(s.type) ? 0 : AUDIO_TAIL_SEC;
    const durationInFrames = Math.max(1, Math.round((seconds + tail) * fps));
    const fromFrame = cursor;
    cursor += durationInFrames;

    if (s.narration?.trim()) {
      const cs = captionsDaCena(s.id, s.narration, fromFrame, fromFrame + durationInFrames, fps, capId, capOpts);
      capId += cs.length;
      captions.push(...cs);
    }

    return {
      id: s.id,
      type: s.type,
      title: s.title,
      subtitle: s.subtitle,
      bullets: s.bullets,
      items: s.items,
      left: s.left,
      right: s.right,
      src: asset?.src,
      seconds,
      durationInFrames,
      fromFrame,
    };
  });

  // Sem sobreposição entre legendas vizinhas.
  captions.sort((a, b) => a.startFrame - b.startFrame);
  for (let i = 0; i < captions.length - 1; i++) {
    if (captions[i].endFrame > captions[i + 1].startFrame) {
      captions[i].endFrame = captions[i + 1].startFrame;
      captions[i].endSec = captions[i + 1].startSec;
    }
  }

  return {
    scenes,
    captions,
    brand,
    fps,
    width: opts.width ?? 1920,
    height: opts.height ?? 1080,
    totalFrames: cursor,
    showBurnedCaptions: opts.showBurnedCaptions ?? true,
    wordHighlight: opts.wordHighlight ?? false,
  };
}

// ── Sidecars de legenda (mesma timeline do vídeo) ────────────────────────────
function tc(sec: number, sep: ',' | '.'): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`;
}

export function exportCaptionsToSrt(captions: AbsCaption[]): string {
  return captions.map((c, i) => `${i + 1}\n${tc(c.startSec, ',')} --> ${tc(c.endSec, ',')}\n${c.text}\n`).join('\n');
}

export function exportCaptionsToVtt(captions: AbsCaption[]): string {
  return 'WEBVTT\n\n' + captions.map((c) => `${tc(c.startSec, '.')} --> ${tc(c.endSec, '.')}\n${c.text}\n`).join('\n');
}
