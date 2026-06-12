// Legendas: a partir do parágrafo por cena (captions-draft.json), fatiamos em
// segmentos legíveis e distribuímos no tempo da cena proporcional ao tamanho do
// texto. Não é um aligner real (isso viria de timestamps do TTS no futuro), mas
// já dá uma legenda coerente e a função de export SRT fica preparada.

export interface RawCaption {
  scene: string;
  speaker?: string;
  text: string;
}

export interface CaptionCue {
  fromFrame: number;
  toFrame: number;
  text: string;
  sceneId: string;
}

interface SceneTiming {
  id: string;
  fromFrame: number;
  durationInFrames: number;
}

/** Quebra um parágrafo em segmentos de ~maxChars, cortando em fim de frase/cláusula. */
export function splitSegments(text: string, maxChars = 80): string[] {
  const frases = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) || [text];
  const out: string[] = [];
  for (const f of frases) {
    let frase = f.trim();
    if (!frase) continue;
    if (frase.length <= maxChars) { out.push(frase); continue; }
    // Frase longa → quebra em cláusulas por vírgula/; mantendo <= maxChars.
    const partes = frase.split(/(?<=[,;:])\s+/);
    let buf = '';
    for (const p of partes) {
      if (buf && (buf.length + p.length + 1) > maxChars) { out.push(buf.trim()); buf = p; }
      else buf = buf ? `${buf} ${p}` : p;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out.length ? out : [text];
}

/** Monta a linha do tempo de legendas (frames absolutos) a partir das cenas. */
export function buildCaptionTimeline(scenes: SceneTiming[], captions: RawCaption[], _fps: number): CaptionCue[] {
  const byScene = new Map(captions.map((c) => [c.scene, c.text]));
  const cues: CaptionCue[] = [];

  for (const sc of scenes) {
    const text = byScene.get(sc.id);
    if (!text) continue;
    const segs = splitSegments(text);
    const totalChars = segs.reduce((a, s) => a + s.length, 0) || 1;
    const start = sc.fromFrame;
    const end = sc.fromFrame + sc.durationInFrames;
    const span = sc.durationInFrames;

    let f = start;
    segs.forEach((seg, i) => {
      const last = i === segs.length - 1;
      const segFrames = last ? end - f : Math.max(18, Math.round(span * (seg.length / totalChars)));
      cues.push({ fromFrame: f, toFrame: Math.min(end, f + segFrames), text: seg, sceneId: sc.id });
      f += segFrames;
    });
  }
  return cues;
}

/** Cue ativo no frame global. */
export function activeCue(cues: CaptionCue[], frame: number): CaptionCue | null {
  return cues.find((c) => frame >= c.fromFrame && frame < c.toFrame) || null;
}

// ── Export SRT (preparado para o futuro — não usado no spike) ────────────────
function srtTime(frame: number, fps: number): string {
  const totalMs = Math.round((frame / fps) * 1000);
  const ms = totalMs % 1000;
  const s = Math.floor(totalMs / 1000) % 60;
  const m = Math.floor(totalMs / 60000) % 60;
  const h = Math.floor(totalMs / 3600000);
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function cuesToSrt(cues: CaptionCue[], fps: number): string {
  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.fromFrame, fps)} --> ${srtTime(c.toFrame, fps)}\n${c.text}\n`)
    .join('\n');
}
