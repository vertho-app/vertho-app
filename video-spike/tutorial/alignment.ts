/** Align reviewed copy to ASR timestamps. Never substitutes ASR text for copy. */
export type WordTime = { word: string; start: number; end: number };
export type AlignedStep = { id: string; start: number; end: number; coverage: number; words: WordTime[] };
export function tokens(text: string): string[] {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\bp\s+d\s+i\b/g, 'pdi').match(/[a-z0-9]+/g) || [];
}
const aliases: Record<string, string> = { vertho: 'verto', vertu: 'verto', pra: 'para', unianxieta: 'unianchieta', '16': 'dezesseis', '5': 'cinco', '2': 'dois', '1': 'um', '10': 'dez', '12': 'doze', '4': 'quatro', '6': 'seis' };
const norm = (s: string) => aliases[s] || s;

export function alignSteps(steps: Array<{ id: string; narration: string }>, observed: WordTime[], duration: number): AlignedStep[] {
  if (!observed.length || !Number.isFinite(duration) || duration <= 0) throw new Error('Transcrição vazia ou duração inválida');
  for (let k = 0; k < observed.length; k++) {
    const w = observed[k];
    if (!(w.start >= 0 && w.end >= w.start && w.end <= duration + 0.15)
      || (k > 0 && w.start < observed[k - 1].start)) throw new Error('Timestamps inválidos ou fora de ordem');
  }
  const want = steps.flatMap((s, step) => tokens(s.narration).map(word => ({ word, step })));
  const got = observed.flatMap(w => tokens(w.word).map((word, i, arr) => ({ word, start: w.start + (w.end - w.start) * i / arr.length, end: w.start + (w.end - w.start) * (i + 1) / arr.length })));
  const n = want.length, m = got.length;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const cost = norm(want[i - 1].word) === norm(got[j - 1].word) ? 0 : 1.8;
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
  }
  const matched = new Map<number, number>();
  let i = n, j = m;
  while (i || j) {
    const same = i > 0 && j > 0 && norm(want[i - 1].word) === norm(got[j - 1].word);
    if (i && j && Math.abs(dp[i][j] - dp[i - 1][j - 1] - (same ? 0 : 1.8)) < 0.001) {
      if (same) matched.set(i - 1, j - 1);
      i--; j--;
    } else if (i && Math.abs(dp[i][j] - dp[i - 1][j] - 1) < 0.001) i--;
    else j--;
  }
  const coverage = matched.size / n;
  if (coverage < 0.96) throw new Error(`Transcrição diverge do roteiro: ${(coverage * 100).toFixed(1)}% alinhado; conferir fala antes de montar`);
  let offset = 0;
  const result = steps.map((step, s) => {
    const ws = want.filter(w => w.step === s);
    const hits = ws.map((_, k) => matched.get(offset + k));
    if (hits.slice(0, 3).filter(k => k !== undefined).length < 2 || hits.slice(-3).filter(k => k !== undefined).length < 2
      || hits.filter(k => k !== undefined).length / ws.length < 0.88) throw new Error(`Etapa sem limites confiáveis: ${step.id}`);
    const words = ws.map((w, k) => {
      const g = hits[k];
      if (g !== undefined) return { word: w.word, start: got[g].start, end: got[g].end };
      const prev = hits.slice(0, k).findLast(x => x !== undefined);
      const next = hits.slice(k + 1).find(x => x !== undefined);
      const start = prev === undefined ? got[next!].start : got[prev].end;
      const end = next === undefined ? start : Math.max(start, got[next].start);
      return { word: w.word, start, end };
    });
    offset += ws.length;
    return { id: step.id, start: words[0].start, end: words.at(-1)!.end, coverage: hits.filter(k => k !== undefined).length / ws.length, words };
  });
  for (let k = 1; k < result.length; k++) {
    if (result[k].start < result[k - 1].end - 0.1) throw new Error('Etapas sobrepostas na transcrição');
  }
  return result;
}
