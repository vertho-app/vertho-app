import { tokens, type AlignedStep } from './alignment';

/** Same groups as the original burned captions (build.mts). */
export function captionGroups(text: string): string[] {
  return text.split(/(?<=[.!?;:—])\s+|\s+(?=—)/).flatMap(s => {
    const words = s.trim().split(/\s+/).filter(Boolean), out: string[] = [];
    for (let i = 0; i < words.length; i += 9) out.push(words.slice(i, i + 9).join(' '));
    return out;
  }).map(s => s.replace(/—/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export type Anchor = { old: number; next: number };
/** Warp visuals only; narration never changes pitch or playback speed. */
export function visualAnchors(opts: {
  text: string; cartela: boolean; oldSeconds: number; oldAudioSeconds: number;
  newSeconds: number; lead: number; sourceStart: number; alignment: AlignedStep;
}): Anchor[] {
  const { text, oldSeconds, oldAudioSeconds, newSeconds, lead, sourceStart, alignment } = opts;
  const anchors: Anchor[] = [{ old: 0, next: 0 }];
  if (!opts.cartela) {
    const groups = captionGroups(text), total = groups.reduce((sum, s) => sum + s.length, 0);
    let chars = 0, word = 0, previousEnd = 0;
    for (const group of groups) {
      const begin = Math.round((chars / total) * oldAudioSeconds * 30) / 30;
      const len = Math.max(0.7, Math.round(group.length / total * oldAudioSeconds * 30) / 30);
      const old = lead + Math.max(begin, previousEnd);
      const next = lead + alignment.words[word].start - sourceStart;
      const prev = anchors.at(-1)!;
      if (old > prev.old + 0.02 && next > prev.next + 0.02 && old < oldSeconds - 0.15 && next < newSeconds - 0.15) anchors.push({ old, next });
      previousEnd = begin + len; chars += group.length; word += tokens(group).length;
    }
  }
  anchors.push({ old: oldSeconds, next: newSeconds });
  return anchors;
}

/** Continuous, monotone piecewise-linear time transform, encoded as hinge sums. */
export function setptsExpression(anchors: Anchor[]): string {
  const slopes = anchors.slice(1).map((a, i) => {
    const b = anchors[i];
    if (!(a.old > b.old && a.next > b.next)) throw new Error('Âncoras de sincronização fora de ordem');
    return (a.next - b.next) / (a.old - b.old);
  });
  let expr = `${slopes[0].toFixed(9)}*T`;
  for (let i = 1; i < slopes.length; i++) {
    expr += `+(${(slopes[i] - slopes[i - 1]).toFixed(9)})*max(0,T-${anchors[i].old.toFixed(6)})`;
  }
  return `(${expr})/TB`;
}
