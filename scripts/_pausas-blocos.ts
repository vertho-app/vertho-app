/** Insere pausas de GAP s nas fronteiras entre blocos de um áudio narrado SEM regerar TTS.
 *  Localiza as 4 fronteiras por proporção de caracteres das seções × duração total, casa cada uma
 *  com o silêncio detectado mais próximo (silencedetect) e ALARGA o silêncio até GAP s.
 *  Rodar: npx tsx scripts/_pausas-blocos.ts <in.mp3> <secoes.json> [out.mp3] [gap=1.2] */
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const JANELA = 14; // s de tolerância entre posição esperada e silêncio real

async function main() {
  const [inMp3, secoesJson] = [process.argv[2], process.argv[3]];
  if (!inMp3 || !secoesJson) throw new Error('uso: npx tsx scripts/_pausas-blocos.ts <in.mp3> <secoes.json> [out.mp3] [gap]');
  const out = path.resolve(process.argv[4] || inMp3.replace(/\.mp3$/i, '-pausas.mp3'));
  const GAP = Number(process.argv[5] || '1.2');
  const secoes = JSON.parse(await readFile(secoesJson, 'utf8')) as { slug: string; texto: string }[];

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'pausa-'));
  const wav = path.join(tmp, 'in.wav');
  await exec(FFMPEG, ['-y', '-i', inMp3, '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);

  // duração total + silêncios detectados
  const det = await exec(FFMPEG, ['-i', wav, '-af', 'silencedetect=n=-35dB:d=0.4', '-f', 'null', '-']).catch((e: any) => e);
  const log: string = `${det.stdout || ''}${det.stderr || ''}`;
  const dur = (() => { const m = log.match(/Duration:\s*(\d+):(\d+):([\d.]+)/); if (!m) throw new Error('sem Duration no ffmpeg'); return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]); })();
  const sil: { s: number; e: number }[] = [];
  for (const m of log.matchAll(/silence_start:\s*([\d.]+)[\s\S]*?silence_end:\s*([\d.]+)/g)) sil.push({ s: Number(m[1]), e: Number(m[2]) });
  if (!sil.length) throw new Error('nenhum silêncio detectado');

  // fronteiras esperadas por proporção de chars
  const chars = secoes.map((x) => x.texto.length);
  const total = chars.reduce((a, b) => a + b, 0);
  let acc = 0;
  const esperadas = chars.slice(0, -1).map((c) => { acc += c; return (acc / total) * dur; });

  const usadas = new Set<number>();
  const cortes: { c: number; pad: number }[] = [];
  for (let b = 0; b < esperadas.length; b++) {
    let melhor = -1, melhorDist = Infinity;
    for (let i = 0; i < sil.length; i++) {
      if (usadas.has(i)) continue;
      const centro = (sil[i].s + sil[i].e) / 2;
      const dist = Math.abs(centro - esperadas[b]);
      if (dist < melhorDist) { melhorDist = dist; melhor = i; }
    }
    if (melhor < 0 || melhorDist > JANELA) { console.warn(`  ⚠ fronteira ${b + 1} (${secoes[b].slug}→${secoes[b + 1].slug}) SEM silêncio a ±${JANELA}s de ${esperadas[b].toFixed(0)}s — pulada`); continue; }
    usadas.add(melhor);
    const { s, e } = sil[melhor];
    const pad = Math.max(0, GAP - (e - s));
    cortes.push({ c: (s + e) / 2, pad });
    console.log(`  fronteira ${b + 1} ${secoes[b].slug}→${secoes[b + 1].slug}: esperada ${esperadas[b].toFixed(1)}s · silêncio ${s.toFixed(1)}–${e.toFixed(1)}s (${(e - s).toFixed(2)}s) · +${pad.toFixed(2)}s`);
  }
  if (cortes.length !== esperadas.length) console.warn(`  ⚠ ${cortes.length}/${esperadas.length} fronteiras casadas — conferir de ouvido`);
  cortes.sort((a, b) => a.c - b.c);

  // corta nos centros e intercala silêncio
  const lista: string[] = [];
  let ini = 0;
  for (let i = 0; i <= cortes.length; i++) {
    const fim = i < cortes.length ? cortes[i].c : dur;
    const seg = path.join(tmp, `seg${i}.wav`);
    await exec(FFMPEG, ['-y', '-i', wav, '-ss', String(ini), '-to', String(fim), '-c:a', 'pcm_s16le', seg]);
    lista.push(seg);
    if (i < cortes.length && cortes[i].pad > 0.01) {
      const p = path.join(tmp, `pad${i}.wav`);
      await exec(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(cortes[i].pad), '-c:a', 'pcm_s16le', p]);
      lista.push(p);
    }
    ini = fim;
  }
  const concat = path.join(tmp, 'concat.txt');
  await writeFile(concat, lista.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  await exec(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', concat, '-ar', '24000', '-c:a', 'libmp3lame', '-q:a', '3', out]);
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
  const totalPad = cortes.reduce((a, b) => a + b.pad, 0);
  console.log(`PRONTO ✅ ${dur.toFixed(0)}s → ${(dur + totalPad).toFixed(0)}s → ${out}`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
