/**
 * Núcleo (puro, sem React/Remotion) do sistema de legendas V3. Compartilhado
 * pelo componente Remotion E pelo script Node que gera SRT/VTT — assim o vídeo e
 * os sidecars usam EXATAMENTE a mesma timeline.
 *
 * Conceitos:
 *  - timeline: começo/fim REAL de cada cena (a partir das durações dos assets).
 *  - timestamps relativos (por cena) → captions ABSOLUTOS (vídeo inteiro).
 */

export type CaptionMode = 'timestamps' | 'proportional' | 'off';

export interface SceneDef {
  id: string;
  type: string;
  file?: string;
  audio?: string;
}

export interface TimelineScene {
  sceneId: string;
  type: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
}

export interface WordTs { word: string; start: number; end: number }
export interface PhraseTs { text: string; start: number; end: number }
export interface TimestampScene {
  sceneId: string;
  audioType?: string;
  sourceFile?: string;
  text?: string;
  words?: WordTs[];
  phrases?: PhraseTs[];
}
export interface TimestampsFile {
  version?: string;
  source?: string;
  language?: string;
  scenes: TimestampScene[];
}

export interface AbsWord { word: string; startFrame: number; endFrame: number }
export interface AbsCaption {
  id: number;
  sceneId: string;
  startSec: number;
  endSec: number;
  startFrame: number;
  endFrame: number;
  text: string;
  words?: AbsWord[];
}

// Mesma regra de duração da V1/V2: avatar = duração exata do vídeo; áudio = áudio
// + 0.3s de respiro. Centralizado AQUI para o vídeo e os sidecars baterem.
const AUDIO_TAIL_SEC = 0.3;

export function basename(p?: string): string {
  return p ? p.split('/').pop() || '' : '';
}

export function durationOf(scene: SceneDef, durations: Record<string, number | null>): number {
  const key = basename(scene.file || scene.audio);
  const d = durations[key];
  if (typeof d === 'number' && d > 0) return d;
  return scene.type.startsWith('avatar') ? 6 : 8; // fallback seguro
}

/** Timeline real (start/end por cena) a partir das durações dos assets. */
export function buildVideoTimeline(scenes: SceneDef[], durations: Record<string, number | null>, fps: number): TimelineScene[] {
  let cursor = 0;
  return scenes.map((s) => {
    const seconds = durationOf(s, durations);
    const tail = s.type.startsWith('avatar') ? 0 : AUDIO_TAIL_SEC;
    const durationInFrames = Math.max(1, Math.round((seconds + tail) * fps));
    const startFrame = cursor;
    const endFrame = cursor + durationInFrames;
    cursor = endFrame;
    return {
      sceneId: s.id,
      type: s.type,
      startSec: startFrame / fps,
      endSec: endFrame / fps,
      durationSec: durationInFrames / fps,
      startFrame,
      endFrame,
      durationInFrames,
    };
  });
}

// ── Conversão timestamps relativos → captions absolutos ─────────────────────

const SENTENCE_END = /[.!?…]$/;

function chunkWords(words: WordTs[], maxWords: number, maxDur: number): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  let buf: WordTs[] = [];
  const flush = () => {
    if (!buf.length) return;
    out.push({ text: buf.map((w) => w.word).join(' '), start: buf[0].start, end: buf[buf.length - 1].end });
    buf = [];
  };
  for (const w of words) {
    const dur = buf.length ? w.end - buf[0].start : 0;
    if (buf.length >= maxWords || dur > maxDur) flush();
    buf.push(w);
    if (SENTENCE_END.test(w.word)) flush();
  }
  flush();
  return out;
}

/** Quebra um texto sem timing em N pedaços com tempo proporcional ao tamanho. */
function chunkTextByTime(text: string, start: number, end: number, maxWords: number): { text: string; start: number; end: number }[] {
  const tokens = text.trim().split(/\s+/);
  if (tokens.length <= maxWords) return [{ text: text.trim(), start, end }];
  const groups: string[][] = [];
  for (let i = 0; i < tokens.length; i += maxWords) groups.push(tokens.slice(i, i + maxWords));
  const totalChars = groups.reduce((a, g) => a + g.join(' ').length, 0) || 1;
  const span = end - start;
  let t = start;
  return groups.map((g) => {
    const txt = g.join(' ');
    const d = span * (txt.length / totalChars);
    const seg = { text: txt, start: t, end: Math.min(end, t + d) };
    t += d;
    return seg;
  });
}

function wordsInRange(words: WordTs[], offset: number, start: number, end: number, fps: number): AbsWord[] {
  return words
    .map((w) => ({ word: w.word, start: offset + w.start, end: offset + w.end }))
    .filter((w) => w.start < end && w.end > start)
    .map((w) => ({ word: w.word, startFrame: Math.round(w.start * fps), endFrame: Math.round(w.end * fps) }));
}

export interface CaptionOpts {
  maxWordsPerCaption?: number;
  maxDurationSec?: number;
  minDurationSec?: number;
}

/** Timestamps por cena (relativos) → captions absolutos do vídeo inteiro. */
export function buildAbsoluteCaptions(args: {
  timestamps: TimestampsFile;
  timeline: TimelineScene[];
  fps: number;
  opts?: CaptionOpts;
}): AbsCaption[] {
  const { timestamps, timeline, fps } = args;
  const maxWords = args.opts?.maxWordsPerCaption ?? 9;
  const maxDur = args.opts?.maxDurationSec ?? 3.5;
  const minDur = args.opts?.minDurationSec ?? 1.0;
  const tlBy = new Map(timeline.map((t) => [t.sceneId, t]));
  const caps: AbsCaption[] = [];
  let id = 1;

  for (const sc of timestamps.scenes) {
    const tl = tlBy.get(sc.sceneId);
    if (!tl) continue;
    const offset = tl.startSec;
    const sceneEnd = tl.endSec;
    const words = sc.words || [];

    // Unidades base (texto + start/end ABSOLUTOS).
    let units: { text: string; start: number; end: number }[] = [];

    if (Array.isArray(sc.phrases) && sc.phrases.length) {
      for (const ph of sc.phrases) {
        const aStart = offset + ph.start;
        const aEnd = Math.min(sceneEnd, offset + ph.end);
        const wc = ph.text.trim().split(/\s+/).length;
        if (wc <= maxWords && aEnd - aStart <= maxDur) {
          units.push({ text: ph.text.trim(), start: aStart, end: aEnd });
        } else if (words.length) {
          // re-divide a frase usando as palavras dentro dela
          const inside = words.filter((w) => offset + w.start >= aStart - 0.05 && offset + w.end <= aEnd + 0.05)
            .map((w) => ({ word: w.word, start: offset + w.start, end: offset + w.end }));
          const parts = inside.length ? chunkWords(inside, maxWords, maxDur) : chunkTextByTime(ph.text, aStart, aEnd, maxWords);
          units.push(...parts);
        } else {
          units.push(...chunkTextByTime(ph.text, aStart, aEnd, maxWords));
        }
      }
    } else if (words.length) {
      units = chunkWords(words.map((w) => ({ word: w.word, start: offset + w.start, end: offset + w.end })), maxWords, maxDur);
    } else {
      // Sem timing nenhum nesta cena → NÃO fabricar. Pula.
      continue;
    }

    for (const u of units) {
      let s = u.start;
      let e = Math.min(sceneEnd, u.end);
      if (e - s < minDur) e = Math.min(sceneEnd, s + minDur);
      const wlist = wordsInRange(words, offset, s, e, fps);
      caps.push({
        id: id++,
        sceneId: sc.sceneId,
        startSec: s,
        endSec: e,
        startFrame: Math.round(s * fps),
        endFrame: Math.round(e * fps),
        text: u.text,
        words: wlist.length ? wlist : undefined,
      });
    }
  }

  // Sem sobreposição: cada legenda termina, no máximo, quando a próxima começa.
  caps.sort((a, b) => a.startFrame - b.startFrame);
  for (let i = 0; i < caps.length - 1; i++) {
    if (caps[i].endFrame > caps[i + 1].startFrame) {
      caps[i].endFrame = caps[i + 1].startFrame;
      caps[i].endSec = caps[i + 1].startSec;
    }
  }
  return caps;
}

// Janela de fala (relativa ao início da cena, em segundos) — vinda de detecção
// de silêncio (ffmpeg). Corta o silêncio de lead-in/lead-out, a maior fonte de
// descasamento das legendas no fallback proporcional.
export type SpeechWindow = { start: number; end: number };

/**
 * Fallback proporcional por cena. As legendas ficam SEMPRE dentro da cena e,
 * quando há `speechWindows`, dentro da janela de FALA (sem o silêncio inicial/
 * final). Timing aproximado — produção deve usar timestamps reais.
 */
export function buildProportionalCaptions(
  timeline: TimelineScene[],
  textByScene: Record<string, string>,
  fps: number,
  opts?: CaptionOpts,
  speechWindows?: Record<string, SpeechWindow>,
): AbsCaption[] {
  const maxWords = opts?.maxWordsPerCaption ?? 9;
  const maxDur = opts?.maxDurationSec ?? 3.5;
  const minDur = opts?.minDurationSec ?? 1.0;
  const caps: AbsCaption[] = [];
  let id = 1;

  for (const tl of timeline) {
    const text = textByScene[tl.sceneId];
    if (!text || !text.trim()) continue; // "legendas não podem mentir": sem texto real → sem legenda
    const win = speechWindows?.[tl.sceneId];
    const startFrame = tl.startFrame + Math.round(Math.max(0, win?.start ?? 0) * fps);
    const endFrame = Math.min(tl.endFrame, tl.startFrame + Math.round((win?.end ?? tl.durationSec) * fps));
    const spanFrames = Math.max(1, endFrame - startFrame);

    // 1) frases por sentença; 2) tempo distribuído por tamanho do texto.
    const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g)?.map((s) => s.trim()) || [text];
    const totalChars = sentences.reduce((a, s) => a + s.length, 0) || 1;

    let f = startFrame;
    sentences.forEach((sentence, si) => {
      const lastSentence = si === sentences.length - 1;
      const sentFrames = lastSentence ? endFrame - f : Math.round(spanFrames * (sentence.length / totalChars));
      const sentStart = f;
      const sentEnd = Math.min(endFrame, f + sentFrames);
      f = sentEnd;

      // 3) divide a frase para respeitar maxWords E maxDur.
      const words = sentence.split(/\s+/);
      const byWords = Math.ceil(words.length / maxWords);
      const byDur = Math.ceil((sentEnd - sentStart) / (maxDur * fps));
      const k = Math.max(1, byWords, byDur);
      const wper = Math.ceil(words.length / k);
      let g = sentStart;
      for (let i = 0; i < k; i++) {
        const chunkWordsArr = words.slice(i * wper, (i + 1) * wper);
        if (!chunkWordsArr.length) break;
        const last = i === k - 1 || (i + 1) * wper >= words.length;
        const cEnd = last ? sentEnd : Math.min(sentEnd, g + Math.round((sentEnd - sentStart) / k));
        const ef = Math.max(g + Math.round(minDur * fps), cEnd);
        const efClamped = Math.min(sentEnd, ef);
        caps.push({ id: id++, sceneId: tl.sceneId, startSec: g / fps, endSec: efClamped / fps, startFrame: g, endFrame: efClamped, text: chunkWordsArr.join(' ') });
        g = efClamped;
        if (last) break;
      }
    });
  }
  // Sem sobreposição entre legendas vizinhas.
  caps.sort((a, b) => a.startFrame - b.startFrame);
  for (let i = 0; i < caps.length - 1; i++) {
    if (caps[i].endFrame > caps[i + 1].startFrame) {
      caps[i].endFrame = caps[i + 1].startFrame;
      caps[i].endSec = caps[i + 1].startSec;
    }
  }
  return caps;
}

/** Gera um timestamps-file PROVISÓRIO (aproximado) a partir das durações reais e
 *  dos textos de captions-draft. Marca claramente como aproximação para preview. */
export function makeProvisionalTimestamps(timeline: TimelineScene[], draftByScene: Record<string, string>): TimestampsFile {
  const scenes: TimestampScene[] = timeline.map((tl) => {
    const text = (draftByScene[tl.sceneId] || '').trim();
    const dur = tl.durationSec;
    const sentences = text.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g)?.map((s) => s.trim()).filter(Boolean) || (text ? [text] : []);
    const totalChars = sentences.reduce((a, s) => a + s.length, 0) || 1;
    const phrases: PhraseTs[] = [];
    const words: WordTs[] = [];
    let t = 0;
    for (const sentence of sentences) {
      const pdur = dur * (sentence.length / totalChars);
      const pStart = t;
      const pEnd = Math.min(dur, t + pdur);
      phrases.push({ text: sentence, start: round3(pStart), end: round3(pEnd) });
      // palavras distribuídas linearmente dentro da frase (estimativa)
      const toks = sentence.split(/\s+/);
      const wdur = (pEnd - pStart) / Math.max(1, toks.length);
      toks.forEach((w, i) => words.push({ word: w, start: round3(pStart + i * wdur), end: round3(pStart + (i + 1) * wdur) }));
      t = pEnd;
    }
    return { sceneId: tl.sceneId, audioType: tl.type.startsWith('avatar') ? 'avatar' : 'audio', text, phrases, words };
  });
  return { version: 'v1', source: 'approximation_for_preview', language: 'pt-BR', scenes };
}

function round3(n: number): number { return Math.round(n * 1000) / 1000; }

// ── Resolução (modo + fallback) ─────────────────────────────────────────────
const PROPORTIONAL_WARNING = 'Usando captions proporcionais; produção deve usar timestamps reais do TTS ou forced alignment.';

export function resolveCaptions(args: {
  mode: CaptionMode;
  timestamps: TimestampsFile | null;
  timeline: TimelineScene[];
  textByScene: Record<string, string>;
  fps: number;
  opts?: CaptionOpts;
  speechWindows?: Record<string, SpeechWindow>;
}): { captions: AbsCaption[]; source: string; warnings: string[] } {
  const warnings: string[] = [];
  if (args.mode === 'off') return { captions: [], source: 'off', warnings };

  const proportional = () => buildProportionalCaptions(args.timeline, args.textByScene, args.fps, args.opts, args.speechWindows);

  if (args.mode === 'proportional') {
    warnings.push(PROPORTIONAL_WARNING);
    return { captions: proportional(), source: 'proportional', warnings };
  }

  // mode === 'timestamps' (default): só usa se for timing REAL (não aproximação).
  const ts = args.timestamps;
  const isReal = !!ts && Array.isArray(ts.scenes) && ts.scenes.length > 0 && ts.source !== 'approximation_for_preview';
  if (isReal) {
    const captions = buildAbsoluteCaptions({ timestamps: ts as TimestampsFile, timeline: args.timeline, fps: args.fps, opts: args.opts });
    if (captions.length) return { captions, source: ts!.source || 'external_tts', warnings };
  }
  if (ts && ts.source === 'approximation_for_preview') {
    warnings.push('captions-timestamps.json é APROXIMAÇÃO (ignorado como timing real).');
  } else {
    warnings.push('captions-timestamps.json real não encontrado.');
  }
  warnings.push(PROPORTIONAL_WARNING);
  return { captions: proportional(), source: 'proportional', warnings };
}

// ── Export SRT / VTT ─────────────────────────────────────────────────────────
function tc(sec: number, sep: ',' | '.'): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const milli = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(milli, 3)}`;
}

export function exportCaptionsToSrt(captions: AbsCaption[]): string {
  return captions.map((c, i) => `${i + 1}\n${tc(c.startSec, ',')} --> ${tc(c.endSec, ',')}\n${c.text}\n`).join('\n');
}

export function exportCaptionsToVtt(captions: AbsCaption[]): string {
  return 'WEBVTT\n\n' + captions.map((c) => `${tc(c.startSec, '.')} --> ${tc(c.endSec, '.')}\n${c.text}\n`).join('\n');
}
