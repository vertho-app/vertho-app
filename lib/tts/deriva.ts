/**
 * PORTÃO DE QUALIDADE do TTS: mede a deriva de uma narração (PCM 16-bit mono) e
 * diz se ela pode ser publicada. Puro (sem rede, sem ffmpeg): roda no runtime da
 * Vercel logo depois da síntese, antes de gravar no Storage.
 *
 * O que mede, por janela de 20 s (a mesma régua de `scripts/_medir-deriva-tts.ts`,
 * calibrada em 04-05/09/2026 contra 2 leituras humanas, o Chirp 3 HD determinístico
 * e 4 defeitos plantados — ver PLANO-DERIVA-PODCAST-2026-09-04.md, seções 1b e 6b):
 *   · volume  — RMS dos frames de fala; inclinação (dB/min) e amplitude entre janelas.
 *               Humanos: −0,13 dB/min. Gemini 3.1 em produção: −1,5 a −3,4 (a voz "sumia").
 *   · timbre  — média dos MFCC 1-12; distância de cada janela à primeira, em
 *               desvios-padrão de frame. Humanos ≤ 0,24σ; 3.1 em produção 0,46-0,82σ
 *               ("parece outra locutora").
 *   · F0      — pitch mediano (autocorrelação). Comparado ao ALVO da voz: é o que
 *               garante que a pessoa A e a pessoa B ouçam a mesma locutora
 *               (3.1: 3,5 st entre takes; 2.5 Flash/Aoede: 0,4-1,0 st).
 *
 * O que NÃO mede: ritmo (precisa de ASR) e expressividade (precisa de gente).
 *
 * Custo: ~1-2 s de CPU para 4 min de áudio (reamostra para 16 kHz e usa hop de 40 ms).
 */

const SR = 16000;
const FRAME = 640;   // 40 ms
const HOP = 640;     // 40 ms (o script de calibração usa 20 ms; medianas por janela mudam <0,1 st)
const GATE_DB = -45;
const F0_MIN = 70, F0_MAX = 400;
const NFFT = 1024;
const N_MEL = 26, N_MFCC = 13;
const JANELA_S = 20;

export interface MetricasDeriva {
  durS: number;
  janelas: number;
  /** Fração dos frames com F0 detectado (fala vozeada). Silêncio e ruído = 0. */
  fracaoVozeada: number;
  f0MedHz: number;
  f0AmpSt: number;
  /** Inclinação do F0 (semitons por minuto) ao longo do arquivo — a assinatura de
   *  "vai subindo/descendo o registro". Amplitude confunde conteúdo com deriva
   *  (pergunta × afirmação); inclinação e registro contra o alvo são específicos. */
  f0SlopeStMin: number;
  loudSlopeDbMin: number;
  loudAmpDb: number;
  timbreMaxVs1a: number;
  /** Distância (σ) da assinatura de timbre deste áudio à assinatura de REFERÊNCIA da
   *  voz, quando ela foi passada — identidade da locutora entre takes e modelos
   *  (0,6σ entre Aoede-3.1 e Aoede-2.5; ≤ 0,3σ entre takes do mesmo modelo). */
  timbreVsRefSigma?: number;
}

/** Assinatura de timbre de uma voz: média e desvio dos MFCC 1-12 nos frames de fala. */
export interface AssinaturaTimbre { media: number[]; sigma: number[]; frames: number }

export function assinaturaTimbre(pcm: Buffer, sampleRate: number): AssinaturaTimbre | null {
  const frames = analisarFrames(paraFloat16k(pcm, sampleRate));
  const mu = timbreMedio(frames);
  if (!mu) return null;
  const sigma = new Float64Array(N_MFCC - 1); let n = 0;
  for (const f of frames) if (f.mfcc) { for (let k = 1; k < N_MFCC; k++) sigma[k - 1] += (f.mfcc[k] - mu[k - 1]) ** 2; n++; }
  for (let k = 0; k < sigma.length; k++) sigma[k] = Math.sqrt(sigma[k] / Math.max(1, n)) || 1;
  return { media: Array.from(mu), sigma: Array.from(sigma), frames: n };
}

/** Distância em σ (da referência) entre a média de timbre de um áudio e a referência. */
export function distanciaTimbre(ref: AssinaturaTimbre, media: ArrayLike<number>): number {
  let acc = 0;
  for (let k = 0; k < ref.media.length; k++) acc += ((media[k] - ref.media[k]) / (ref.sigma[k] || 1)) ** 2;
  return Math.sqrt(acc / ref.media.length);
}

/** Combina várias assinaturas (takes de referência) numa só: média das médias e σ pooled. */
export function combinarAssinaturas(as: AssinaturaTimbre[]): AssinaturaTimbre {
  const n = as[0].media.length;
  const media = Array.from({ length: n }, (_, k) => as.reduce((s, a) => s + a.media[k], 0) / as.length);
  const sigma = Array.from({ length: n }, (_, k) => Math.sqrt(as.reduce((s, a) => s + a.sigma[k] ** 2 + (a.media[k] - media[k]) ** 2, 0) / as.length));
  return { media, sigma, frames: as.reduce((s, a) => s + a.frames, 0) };
}

export interface AlvoVoz {
  /** F0 mediano esperado da voz (Hz). Medido em 14 arquivos por voz em 05/09/2026. */
  f0Hz: number;
  /** Tolerância em semitons (default 1,0: a pessoa A e a B ouvem "a mesma" locutora). */
  tolSt?: number;
}

/**
 * Alvos de F0 por voz prebuilt, no `gemini-2.5-flash-tts`. Medido em 05/09/2026
 * (14 sínteses por voz, 4 roteiros): Aoede mediana 208 Hz (faixa 201-221), Iapetus
 * 144 Hz (131-159). Voz sem alvo aqui → o portão não checa F0 (só volume e timbre).
 */
export const ALVO_F0_POR_VOZ: Record<string, AlvoVoz> = {
  Aoede: { f0Hz: 208 },
  Iapetus: { f0Hz: 144 },
};

/** Limiares calibrados para as âncoras passarem (humanos, Chirp) e a produção 3.1 reprovar. */
export const LIMIARES_DERIVA = {
  loudSlopeDbMin: -0.8,
  loudAmpDb: 4.0,
  timbreMaxVs1a: 0.35,
  f0TolSt: 1.0,
  /** Veto de inclinação. `Medido 05/09/2026`: humanos −0,04 e +0,20 st/min; Aoede e Iapetus
   *  ≤ 0,61 em 28 arquivos; Algieba (reprovado de ouvido E de régua) +2,66. */
  f0SlopeStMin: 1.5,
  /** Mínimo de frames vozeados para o áudio contar como fala. Narração TTS fica em
   *  ~0,4-0,6 (pausas e consoantes surdas ficam fora); silêncio e ruído, em 0. */
  fracaoVozeadaMin: 0.15,
};

// ── DSP mínimo ────────────────────────────────────────────────────────────────

function paraFloat16k(pcm: Buffer, sampleRate: number): Float32Array {
  const n = Math.floor(pcm.length / 2);
  if (sampleRate === SR) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = pcm.readInt16LE(i * 2) / 32768;
    return out;
  }
  const m = Math.max(1, Math.floor(n * SR / sampleRate));
  const out = new Float32Array(m);
  const ratio = sampleRate / SR;
  for (let i = 0; i < m; i++) {
    const pos = i * ratio;
    const a = Math.min(n - 1, Math.floor(pos)), b = Math.min(n - 1, a + 1);
    const frac = pos - a;
    out[i] = (pcm.readInt16LE(a * 2) * (1 - frac) + pcm.readInt16LE(b * 2) * frac) / 32768;
  }
  return out;
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const hz2mel = (f: number) => 2595 * Math.log10(1 + f / 700);
const mel2hz = (m: number) => 700 * (10 ** (m / 2595) - 1);
const MEL_FILTERS: { lo: number; mid: number; hi: number }[] = (() => {
  const pts: number[] = [];
  const mLo = hz2mel(0), mHi = hz2mel(SR / 2);
  for (let i = 0; i < N_MEL + 2; i++) pts.push(Math.round(mel2hz(mLo + (mHi - mLo) * i / (N_MEL + 1)) / (SR / NFFT)));
  return Array.from({ length: N_MEL }, (_, i) => ({ lo: pts[i], mid: pts[i + 1], hi: pts[i + 2] }));
})();
const DCT: number[][] = Array.from({ length: N_MFCC }, (_, k) => Array.from({ length: N_MEL }, (_, n) => Math.cos(Math.PI * k * (n + 0.5) / N_MEL)));
const HANN = new Float64Array(FRAME).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FRAME - 1)));

type Frame = { t: number; db: number; f0: number | null; mfcc: Float64Array | null };

function analisarFrames(x: Float32Array): Frame[] {
  const frames: Frame[] = [];
  const lagMin = Math.floor(SR / F0_MAX), lagMax = Math.ceil(SR / F0_MIN);
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT), mag = new Float64Array(NFFT / 2);
  const seg = new Float64Array(FRAME);
  for (let start = 0; start + FRAME <= x.length; start += HOP) {
    let e = 0;
    for (let i = 0; i < FRAME; i++) e += x[start + i] * x[start + i];
    const db = 20 * Math.log10(Math.sqrt(e / FRAME) + 1e-9);
    let f0: number | null = null, mfcc: Float64Array | null = null;
    if (db > GATE_DB) {
      let m = 0;
      for (let i = 0; i < FRAME; i++) m += x[start + i];
      m /= FRAME;
      for (let i = 0; i < FRAME; i++) seg[i] = x[start + i] - m;
      re.fill(0); im.fill(0);
      for (let i = 0; i < FRAME; i++) re[i] = (seg[i] - (i ? 0.97 * seg[i - 1] : 0)) * HANN[i];
      fft(re, im);
      for (let k = 0; k < NFFT / 2; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const en = new Float64Array(N_MEL);
      for (let i = 0; i < N_MEL; i++) {
        const { lo, mid, hi } = MEL_FILTERS[i];
        let acc = 0;
        for (let k = lo; k < mid; k++) acc += mag[k] * (k - lo) / Math.max(1, mid - lo);
        for (let k = mid; k <= hi && k < mag.length; k++) acc += mag[k] * (hi - k) / Math.max(1, hi - mid);
        en[i] = Math.log(acc + 1e-10);
      }
      mfcc = new Float64Array(N_MFCC);
      for (let k = 0; k < N_MFCC; k++) { let s = 0; for (let n = 0; n < N_MEL; n++) s += DCT[k][n] * en[n]; mfcc[k] = s; }
      let r0 = 0;
      for (let i = 0; i < FRAME; i++) r0 += seg[i] * seg[i];
      let best = 0, bestLag = -1;
      for (let lag = lagMin; lag <= lagMax; lag++) {
        let r = 0;
        for (let i = 0; i + lag < FRAME; i++) r += seg[i] * seg[i + lag];
        const norm = r / (r0 * (FRAME - lag) / FRAME + 1e-12);
        if (norm > best) { best = norm; bestLag = lag; }
      }
      if (best > 0.55 && bestLag > 0) {
        const half = Math.round(bestLag / 2);
        if (half >= lagMin) {
          let r = 0;
          for (let i = 0; i + half < FRAME; i++) r += seg[i] * seg[i + half];
          if (r / (r0 * (FRAME - half) / FRAME + 1e-12) > 0.85 * best) bestLag = half;
        }
        f0 = SR / bestLag;
      }
    }
    frames.push({ t: start / SR, db, f0, mfcc });
  }
  return frames;
}

function mediana(a: number[]): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const media = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const st = (f1: number, f0: number) => 12 * Math.log2(f1 / f0);

function inclinacao(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = media(xs), my = media(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den ? num / den : 0;
}

function timbreMedio(frames: Frame[]): Float64Array | null {
  const v = new Float64Array(N_MFCC - 1); let n = 0;
  for (const f of frames) if (f.mfcc) { for (let k = 1; k < N_MFCC; k++) v[k - 1] += f.mfcc[k]; n++; }
  if (n < 12) return null;
  for (let k = 0; k < v.length; k++) v[k] /= n;
  return v;
}

// ── API ───────────────────────────────────────────────────────────────────────

/** Mede a deriva de um PCM 16-bit mono (qualquer sample-rate). */
export function medirDeriva(pcm: Buffer, sampleRate: number, referencia?: AssinaturaTimbre | null): MetricasDeriva {
  const x = paraFloat16k(pcm, sampleRate);
  const frames = analisarFrames(x);
  const timbreArquivo = timbreMedio(frames);
  const timbreVsRefSigma = referencia && timbreArquivo ? distanciaTimbre(referencia, timbreArquivo) : undefined;
  const durS = x.length / SR;
  const nWin = Math.max(1, Math.floor(durS / JANELA_S));

  // σ por coeficiente ao longo do arquivo (escala da distância de timbre)
  const mu = timbreMedio(frames) || new Float64Array(N_MFCC - 1);
  const sigma = new Float64Array(N_MFCC - 1); let nS = 0;
  for (const f of frames) if (f.mfcc) { for (let k = 1; k < N_MFCC; k++) sigma[k - 1] += (f.mfcc[k] - mu[k - 1]) ** 2; nS++; }
  for (let k = 0; k < sigma.length; k++) sigma[k] = Math.sqrt(sigma[k] / Math.max(1, nS)) || 1;

  const dbs: number[] = [], f0s: number[] = [], tims: (Float64Array | null)[] = [], ts: number[] = [];
  for (let w = 0; w < nWin; w++) {
    const t0 = w * JANELA_S, t1 = w === nWin - 1 ? Infinity : (w + 1) * JANELA_S;
    const fr = frames.filter((f) => f.t >= t0 && f.t < t1);
    const sp = fr.filter((f) => f.db > GATE_DB);
    const vo = fr.filter((f) => f.f0 !== null);
    if (sp.length < 5) continue;
    dbs.push(media(sp.map((f) => f.db)));
    f0s.push(mediana(vo.map((f) => f.f0!)));
    tims.push(timbreMedio(fr));
    ts.push(t0 / 60);
  }
  const f0Med = mediana(frames.filter((f) => f.f0 !== null).map((f) => f.f0!));
  const f0Ok = f0s.filter(Number.isFinite);
  const f0St = f0Ok.map((f) => st(f, f0Med));
  const tsF0 = ts.filter((_, i) => Number.isFinite(f0s[i]));
  let timbreMax = 0;
  for (let i = 1; i < tims.length; i++) {
    const a = tims[0], b = tims[i];
    if (!a || !b) continue;
    let acc = 0;
    for (let k = 0; k < a.length; k++) acc += ((a[k] - b[k]) / sigma[k]) ** 2;
    timbreMax = Math.max(timbreMax, Math.sqrt(acc / a.length));
  }
  return {
    durS,
    janelas: dbs.length,
    fracaoVozeada: frames.length ? frames.filter((f) => f.f0 !== null).length / frames.length : 0,
    f0MedHz: f0Med,
    f0AmpSt: f0St.length ? Math.max(...f0St) - Math.min(...f0St) : 0,
    f0SlopeStMin: inclinacao(tsF0, f0St),
    loudSlopeDbMin: inclinacao(ts, dbs),
    loudAmpDb: dbs.length ? Math.max(...dbs) - Math.min(...dbs) : 0,
    timbreMaxVs1a: timbreMax,
    ...(timbreVsRefSigma !== undefined ? { timbreVsRefSigma } : {}),
  };
}

/**
 * Veredito: `ok` quando volume e timbre ficam dentro do piso humano e, se a voz tem
 * alvo, o F0 mediano fica a ≤ `tolSt` semitons dele. Em áudio curto (< 2 janelas)
 * só o F0 é julgado — inclinação de 1 janela não existe.
 */
export function avaliarDeriva(m: MetricasDeriva, alvo?: AlvoVoz | null): { ok: boolean; motivos: string[] } {
  const motivos: string[] = [];
  // TEM FALA? Sem frames vozeados nenhuma régua se aplica, e a saída era `ok`:
  // medido 06/09, 5 s de silêncio e 5 s de ruído a −50 dBFS voltavam aprovados.
  // Um take mudo ou só ruído não pode ser publicado como "menos ruim".
  if (!Number.isFinite(m.f0MedHz) || m.fracaoVozeada < LIMIARES_DERIVA.fracaoVozeadaMin) {
    motivos.push(`sem fala (${(m.fracaoVozeada * 100).toFixed(0)} % de frames vozeados; mínimo ${LIMIARES_DERIVA.fracaoVozeadaMin * 100} %)`);
    return { ok: false, motivos };
  }
  if (m.janelas >= 2) {
    if (m.loudSlopeDbMin < LIMIARES_DERIVA.loudSlopeDbMin) motivos.push(`volume cai ${m.loudSlopeDbMin.toFixed(2)} dB/min`);
    if (m.loudAmpDb > LIMIARES_DERIVA.loudAmpDb) motivos.push(`volume varia ${m.loudAmpDb.toFixed(1)} dB`);
    if (m.timbreMaxVs1a > LIMIARES_DERIVA.timbreMaxVs1a) motivos.push(`timbre muda ${m.timbreMaxVs1a.toFixed(2)}σ`);
  }
  // Inclinação de F0 é veto por si só: volume e timbre passam enquanto o registro
  // sobe (Algieba: 154 → 216 Hz num episódio). Com 3+ janelas a regressão já separa
  // deriva de conteúdo; com 2, seria o salto entre duas janelas, que confunde.
  if (m.janelas >= 3 && Math.abs(m.f0SlopeStMin) > LIMIARES_DERIVA.f0SlopeStMin) {
    motivos.push(`registro deriva ${m.f0SlopeStMin > 0 ? '+' : ''}${m.f0SlopeStMin.toFixed(2)} st/min`);
  }
  if (alvo && Number.isFinite(m.f0MedHz)) {
    const d = st(m.f0MedHz, alvo.f0Hz);
    if (Math.abs(d) > (alvo.tolSt ?? LIMIARES_DERIVA.f0TolSt)) motivos.push(`registro ${d > 0 ? '+' : ''}${d.toFixed(1)} st do alvo (${m.f0MedHz.toFixed(0)} vs ${alvo.f0Hz} Hz)`);
  }
  return { ok: motivos.length === 0, motivos };
}

/** Resumo de uma linha para log/ledger. */
export function resumirDeriva(m: MetricasDeriva): string {
  return `dur ${m.durS.toFixed(0)}s · F0 ${m.f0MedHz.toFixed(0)}Hz (amp ${m.f0AmpSt.toFixed(1)}st, slope ${m.f0SlopeStMin >= 0 ? '+' : ''}${m.f0SlopeStMin.toFixed(2)}st/min) · vol ${m.loudSlopeDbMin.toFixed(2)}dB/min (amp ${m.loudAmpDb.toFixed(1)}dB) · timbre ${m.timbreMaxVs1a.toFixed(2)}σ`;
}
