/**
 * Monta os inputProps do Remotion (produto) a partir do ROTEIRO + ASSETS remotos.
 * Autocontido (sem staticFile, sem JSON estático, sem dependência do spike) para
 * ser portável ao worker do trigger.dev. Espelha o SpikePropsV3 do spike, mas com
 * `src` = URL pública (mp4 do avatar / mp3 das demais cenas) e timeline computada
 * a partir das durações reais (ffprobe), com legendas PROPORCIONAIS.
 */
import { z } from 'zod';
import type { RoteiroScene, VideoRoteiro } from './roteiro-prompt';
import type { WordTime } from './whisper-align';

export interface Brand { primary: string; secondary: string; background: string; font?: string }

// ── Schema do CONTRATO render_inputprops (M2) ────────────────────────────────
// Valida o que o worker vai renderizar ANTES de persistir: campos críticos
// (durações/frames/dimensões) + continuidade da timeline. Falha cedo e visível
// em vez de gerar vídeo quebrado ou estourar no Remotion. Usa safeParse só p/
// validar (retornamos o objeto original — zod não deve "stripar" os campos de
// conteúdo das cenas).
const SceneCriticoSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  seconds: z.number().nonnegative(),
  durationInFrames: z.number().int().positive(),
  fromFrame: z.number().int().nonnegative(),
});
const PropsCriticoSchema = z.object({
  scenes: z.array(SceneCriticoSchema).min(1),
  brand: z.object({ primary: z.string(), secondary: z.string(), background: z.string() }),
  fps: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  totalFrames: z.number().int().positive(),
});

function validarInputProps(out: SpikePropsV3): void {
  const r = PropsCriticoSchema.safeParse(out);
  if (!r.success) {
    const issues = r.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`render_inputprops inválido (schema): ${issues}`);
  }
  // Continuidade da timeline (zod não cobre relação entre campos):
  // totalFrames == soma das durações e fromFrame contíguo.
  let cursor = 0;
  for (const s of out.scenes) {
    if (s.fromFrame !== cursor) throw new Error(`render_inputprops: fromFrame descontínuo em '${s.id}' (esperado ${cursor}, veio ${s.fromFrame})`);
    cursor += s.durationInFrames;
  }
  if (cursor !== out.totalFrames) throw new Error(`render_inputprops: totalFrames (${out.totalFrames}) ≠ soma das cenas (${cursor})`);
}

// ⚠️ MIRROR — este shape é o CONTRATO do render_inputprops e é espelhado em
// `video-spike/remotion/data/load-scenes.ts` (ComputedScene). Os dois são projetos
// TS separados de PROPÓSITO (montar-inputprops roda no trigger; o bundle é
// standalone) → não há tipo compartilhado. Ao mudar um campo aqui, replique lá.
export interface ComputedScene {
  id: string;
  type: RoteiroScene['type'];
  title?: string;
  subtitle?: string;
  bullets?: string[];
  items?: string[];
  icons?: string[];
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
  // Avatar: áudio (mp3 da narração) tocado SEPARADO do vídeo (mp4 mutado) — o
  // OffthreadVideo introduzia um pequeno offset no áudio embutido; tocar o mp3
  // alinhado pelo Remotion casa o lip-sync com precisão.
  audioSrc?: string;
  // M4 — janela de FALA real (frames RELATIVOS à cena) a partir do Whisper, p/
  // pacear as animações pela voz em vez da fração da cena. Ausente = fallback.
  speechStartFrame?: number;
  speechEndFrame?: number;
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

/** Asset (URL + duração real) de cada cena, indexado por sceneId. `audioSrc` =
 *  áudio separado (avatar: mp3 da narração, p/ lip-sync preciso). `words` = timing
 *  por palavra (Whisper/M4) p/ legendas e animações sincronizadas. */
export type AssetMap = Record<string, { src: string; durationSec: number; audioSrc?: string; words?: WordTime[] }>;

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

/**
 * Legendas com TIMING REAL (M4): usa o NOSSO texto (grafia correta) com os
 * timestamps do Whisper. Mapeia índice-de-palavra-nosso → índice-Whisper de forma
 * proporcional (robusto a divergência de contagem: exato quando bate, degrada a
 * proporcional quando não). Quebra em linhas por fim-de-frase ou maxWords.
 */
function captionsFromWords(
  sceneId: string, text: string, words: WordTime[], fromFrame: number, fps: number, startId: number,
  opts: { maxWords: number },
): AbsCaption[] {
  const ours = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const O = ours.length, W = words.length;
  if (!O || !W) return [];
  const wIdx = (i: number) => (O <= 1 ? 0 : Math.min(W - 1, Math.max(0, Math.round((i * (W - 1)) / (O - 1)))));
  const caps: AbsCaption[] = [];
  let id = startId;
  let a = 0;
  for (let i = 0; i < O; i++) {
    const last = i === O - 1;
    const endsSentence = /[.!?…]$/.test(ours[i]);
    if (i - a + 1 >= opts.maxWords || endsSentence || last) {
      const sf = fromFrame + Math.round(words[wIdx(a)].start * fps);
      const ef = Math.max(sf + 1, fromFrame + Math.round(words[wIdx(i)].end * fps));
      caps.push({ id: id++, sceneId, startSec: sf / fps, endSec: ef / fps, startFrame: sf, endFrame: ef, text: ours.slice(a, i + 1).join(' ') });
      a = i + 1;
    }
  }
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

    // M4: janela de fala real (frames RELATIVOS à cena) p/ as animações.
    let speechStartFrame: number | undefined;
    let speechEndFrame: number | undefined;
    if (asset?.words?.length) {
      speechStartFrame = Math.max(0, Math.round(asset.words[0].start * fps));
      speechEndFrame = Math.min(durationInFrames, Math.round(asset.words[asset.words.length - 1].end * fps));
    }

    if (s.narration?.trim()) {
      // Legendas: timing REAL por palavra (Whisper) quando há `words`; senão heurística.
      const cs = asset?.words?.length
        ? captionsFromWords(s.id, s.narration, asset.words, fromFrame, fps, capId, capOpts)
        : captionsDaCena(s.id, s.narration, fromFrame, fromFrame + durationInFrames, fps, capId, capOpts);
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
      icons: s.icons,
      left: s.left,
      right: s.right,
      stat: s.stat,
      quote: s.quote,
      rungs: s.rungs,
      target: s.target,
      myth: s.myth,
      truth: s.truth,
      term: s.term,
      definition: s.definition,
      prompt: s.prompt,
      tag: s.tag,
      src: asset?.src,
      audioSrc: asset?.audioSrc,
      speechStartFrame,
      speechEndFrame,
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

  const out: SpikePropsV3 = {
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
  validarInputProps(out); // M2 — falha cedo e visível se o contrato quebrar
  return out;
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
