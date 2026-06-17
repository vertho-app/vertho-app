/**
 * Personalização nominal (Rota A) — roda na MESMA box de render.
 *
 * Prepend de uma saudação curta "Olá, {nome}" (card com o nome na tela + voz-over
 * TTS Kore) ao deck genérico da célula. O avatar do deck NÃO fala o nome → o deck
 * continua reutilizável por todos da célula; só esta camada é por pessoa.
 *
 * Puro Node + ffmpeg (sem Next). ffmpeg, ffprobe e a fonte Liberation já estão na
 * imagem do worker (Dockerfile). Precisa de GEMINI_API_KEY no ambiente.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
const VOICE = process.env.VIDEO_TTS_VOICE || 'Callirrhoe';
const FONT = process.env.PERSONALIZE_FONT || '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf';
const BG = process.env.PERSONALIZE_BG || '0x142F57'; // navy da marca

// Escapa caminho p/ o filtro drawtext (o ':' do drive no Windows e os '\' quebram
// o parser; no Linux é no-op pois os paths não têm esses caracteres).
const escDraw = (p) => String(p).replace(/\\/g, '/').replace(/:/g, '\\:');

export function primeiroNome(nome) {
  const first = String(nome || '').trim().split(/\s+/)[0] || '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : '';
}

function pcmToWav(pcm, rate = 24000, ch = 1, bits = 16) {
  const ba = (ch * bits) / 8, br = rate * ba, h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(ch, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(br, 28); h.writeUInt16LE(ba, 32); h.writeUInt16LE(bits, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Gera o áudio "Olá, {nome}!" (Gemini TTS, voz Kore) num WAV. */
async function ttsSaudacao(nome, outWav) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY ausente');
  const styled = `Diga de forma calorosa e acolhedora, como um cumprimento pessoal em português do Brasil:\n\nOlá, ${nome}!`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    contents: [{ parts: [{ text: styled }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
  }) });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
  if (!part) throw new Error('TTS sem áudio');
  const pcm = Buffer.from(part.inlineData.data, 'base64');
  const rate = parseInt(part.inlineData.mimeType?.match(/rate=(\d+)/)?.[1] ?? '24000', 10);
  await writeFile(outWav, pcmToWav(pcm, rate));
}

async function dur(file) {
  const { stdout } = await exec(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return parseFloat(String(stdout).trim()) || 0;
}

async function probeVideo(deckPath) {
  const { stdout } = await exec(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,pix_fmt', '-of', 'json', deckPath]);
  const v = JSON.parse(stdout).streams[0];
  const [n, d] = (v.r_frame_rate || '30/1').split('/').map(Number);
  return { width: v.width, height: v.height, fps: d ? Math.round(n / d) : 30, pixFmt: v.pix_fmt || 'yuv420p' };
}

/**
 * Personaliza: prepend "Olá, {nome}" (card + TTS) ao deck. Tenta concat por
 * stream-copy (instantâneo, se os params do card baterem com o deck); se falhar,
 * cai pro concat-filter (re-encode). Retorna outPath.
 */
export async function personalizar(deckPath, nomeCompleto, outPath) {
  const nome = primeiroNome(nomeCompleto) || 'tudo bem';
  const work = await mkdtemp(path.join(os.tmpdir(), 'perso-'));
  try {
    const greetWav = path.join(work, 'greet.wav');
    await ttsSaudacao(nome, greetWav);
    const { width, height, fps, pixFmt } = await probeVideo(deckPath);
    const greetDur = Math.max(2.4, (await dur(greetWav)) + 0.6);

    // Card da saudação: fundo navy + nome na tela (textfile evita escaping) + voz-over.
    const txt = path.join(work, 'nome.txt');
    await writeFile(txt, `Olá, ${nome}`);
    const greetMp4 = path.join(work, 'greet.mp4');
    await exec(FFMPEG, ['-y',
      '-f', 'lavfi', '-i', `color=c=${BG}:s=${width}x${height}:r=${fps}:d=${greetDur.toFixed(2)}`,
      '-i', greetWav,
      '-vf', `drawtext=fontfile=${escDraw(FONT)}:textfile=${escDraw(txt)}:fontcolor=white:fontsize=${Math.round(height * 0.1)}:x=(w-text_w)/2:y=(h-text_h)/2`,
      '-c:v', 'libx264', '-pix_fmt', pixFmt, '-r', String(fps),
      '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-shortest', '-t', greetDur.toFixed(2), greetMp4]);

    const listFile = path.join(work, 'list.txt');
    await writeFile(listFile, `file '${greetMp4}'\nfile '${deckPath}'\n`);
    try {
      await exec(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', outPath]);
    } catch {
      await exec(FFMPEG, ['-y', '-i', greetMp4, '-i', deckPath, '-filter_complex',
        '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]', '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-pix_fmt', pixFmt, '-c:a', 'aac', '-movflags', '+faststart', outPath]);
    }
    return outPath;
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
