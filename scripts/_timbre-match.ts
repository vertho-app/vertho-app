/** Escolhe, por bloco, o take de timbre mais "típico" e monta o áudio final com pausas.
 *  Impressão espectral DIY (sem deps): frames Hann 1024/hop 512 → FFT → 24 bandas mel (100–8000 Hz)
 *  → média das log-energias nos frames com fala, vetor centrado. Distância = 1 − correlação.
 *  Score do take = dist ao centroide do bloco + 0.5 × deriva interna (1ª vs 2ª metade).
 *  Rodar: npx tsx scripts/_timbre-match.ts <takesDir> [out.mp3] [gap=1.2] */
import { readFile, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const N = 1024, HOP = 512, SR = 24000, NB = 24, FLO = 100, FHI = 8000;

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
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

const mel = (f: number) => 2595 * Math.log10(1 + f / 700);
const imel = (m: number) => 700 * (10 ** (m / 2595) - 1);
function melBanks(): number[][] {
  const pts = Array.from({ length: NB + 2 }, (_, i) => imel(mel(FLO) + ((mel(FHI) - mel(FLO)) * i) / (NB + 1)));
  const bins = pts.map((f) => Math.round((f / (SR / 2)) * (N / 2)));
  return Array.from({ length: NB }, (_, b) => [bins[b], bins[b + 1], bins[b + 2]]);
}
const BANKS = melBanks();
const HANN = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));

function fingerprintFrames(pcm: Float32Array): { vecs: number[][]; rms: number[] } {
  const vecs: number[][] = [], rms: number[] = [];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= pcm.length; s += HOP) {
    let e = 0;
    for (let i = 0; i < N; i++) { re[i] = pcm[s + i] * HANN[i]; im[i] = 0; e += pcm[s + i] ** 2; }
    rms.push(Math.sqrt(e / N));
    fft(re, im);
    const pow = new Float64Array(N / 2);
    for (let i = 0; i < N / 2; i++) pow[i] = re[i] ** 2 + im[i] ** 2;
    vecs.push(BANKS.map(([a, b, c]) => {
      let acc = 0;
      for (let i = a; i < c; i++) acc += pow[i] * (i < b ? (i - a) / Math.max(1, b - a) : (c - i) / Math.max(1, c - b));
      return Math.log10(acc + 1e-12);
    }));
  }
  return { vecs, rms };
}

function media(vs: number[][]): number[] {
  const m = new Array(NB).fill(0);
  for (const v of vs) for (let i = 0; i < NB; i++) m[i] += v[i] / vs.length;
  const mu = m.reduce((a, b) => a + b, 0) / NB;
  return m.map((x) => x - mu); // centrado: remove ganho global
}

function dist(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < NB; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return 1 - dot / Math.sqrt(na * nb || 1);
}

async function analisar(mp3: string, tmp: string): Promise<{ fp: number[]; deriva: number }> {
  const raw = path.join(tmp, 'a.f32');
  await exec(FFMPEG, ['-y', '-i', mp3, '-ar', String(SR), '-ac', '1', '-f', 'f32le', raw]);
  const buf = await readFile(raw);
  const pcm = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const { vecs, rms } = fingerprintFrames(pcm);
  const ord = [...rms].sort((a, b) => a - b);
  const thr = 0.25 * ord[Math.floor(ord.length * 0.75)];
  const fala = vecs.filter((_, i) => rms[i] > thr);
  if (fala.length < 40) throw new Error(`${mp3}: só ${fala.length} frames com fala`);
  const meio = Math.floor(fala.length / 2);
  return { fp: media(fala), deriva: dist(media(fala.slice(0, meio)), media(fala.slice(meio))) };
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('uso: npx tsx scripts/_timbre-match.ts <takesDir> [out.mp3] [gap]');
  const out = path.resolve(process.argv[3] || path.join(dir, 'montagem-final.mp3'));
  const GAP = Number(process.argv[4] || '1.2');
  const files = (await readdir(dir)).filter((f) => /^b\d+t\d+\.mp3$/.test(f)).sort();
  const blocos = new Map<number, string[]>();
  for (const f of files) {
    const b = Number(f.match(/^b(\d+)/)![1]);
    blocos.set(b, [...(blocos.get(b) || []), path.join(dir, f)]);
  }
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'timbre-'));
  const escolhidos: string[] = [];

  for (const [b, takes] of [...blocos.entries()].sort((x, y) => x[0] - y[0])) {
    const infos = [];
    for (const t of takes) infos.push({ t, ...(await analisar(t, tmp)) });
    const centroide = media(infos.map((i) => i.fp));
    const scored = infos.map((i) => ({ ...i, dc: dist(i.fp, centroide), score: dist(i.fp, centroide) + 0.5 * i.deriva }))
      .sort((a, b2) => a.score - b2.score);
    console.log(`bloco ${b}:`);
    for (const s of scored) console.log(`  ${path.basename(s.t)} · dist-centro ${s.dc.toFixed(4)} · deriva-interna ${s.deriva.toFixed(4)} · score ${s.score.toFixed(4)}${s === scored[0] ? '  ← ESCOLHIDO' : ''}`);
    escolhidos.push(scored[0].t);
  }

  // montagem: takes escolhidos + GAP s de silêncio
  const sil = path.join(tmp, 'sil.wav');
  await exec(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(GAP), '-c:a', 'pcm_s16le', sil]);
  const lista: string[] = [];
  for (let i = 0; i < escolhidos.length; i++) {
    const w = path.join(tmp, `e${i}.wav`);
    await exec(FFMPEG, ['-y', '-i', escolhidos[i], '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', w]);
    if (i > 0) lista.push(sil);
    lista.push(w);
  }
  const concat = path.join(tmp, 'concat.txt');
  await writeFile(concat, lista.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  await exec(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', concat, '-ar', '24000', '-c:a', 'libmp3lame', '-q:a', '3', out]);
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
  console.log(`PRONTO ✅ → ${out}`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
