/**
 * Personalização nominal (Rota A) — roda na MESMA box de render.
 *
 * Prepend de uma cena de SAUDAÇÃO "Olá, {nome}" ao deck genérico da célula:
 *   • renderizada via Remotion (composição `AvatarGreeting` do mesmo bundle) →
 *     mesmo padrão visual do deck (fundo, logo, eyebrow, tipografia);
 *   • "Olá, {nome}" entra à esquerda + a FOTO da mentora desliza pela direita
 *     (estática → reuso total, sem lip-sync nem custo HeyGen);
 *   • voz-over TTS Callirrhoe "Olá, {nome}!".
 * O deck NÃO fala o nome → continua reutilizável por todos da célula; só esta
 * cena é por pessoa.
 *
 * Node + ffmpeg + @remotion/renderer (já na imagem do worker). Precisa de
 * GEMINI_API_KEY (TTS) e SUPABASE_URL/SERVICE_ROLE_KEY (hospedar o áudio do
 * voice-over como URL pública p/ o <Audio> do Remotion).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { selectComposition, renderMedia, ensureBrowser } from '@remotion/renderer';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
const VOICE = process.env.VIDEO_TTS_VOICE || 'Callirrhoe';
const SUPA = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = 'video-assets';
const DEFAULT_BRAND = { primary: '#6D28D9', secondary: '#0EA5E9', background: '#0B1020', font: 'Inter, system-ui, sans-serif' };

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

/** Gera o áudio "Olá, {nome}!" (Gemini TTS, voz Callirrhoe) num WAV. */
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

/** Sobe o WAV do voice-over no bucket público → URL p/ o <Audio> do Remotion. */
async function uploadAudio(buf, key) {
  if (!SUPA || !SRK) throw new Error('SUPABASE_URL/SERVICE_ROLE_KEY ausentes (áudio do greeting)');
  const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'audio/wav', 'x-upsert': 'true' },
    body: buf,
  });
  if (!r.ok) throw new Error(`upload greeting audio ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return `${SUPA}/storage/v1/object/public/${BUCKET}/${key}`;
}

/**
 * Personaliza: renderiza a cena de SAUDAÇÃO (Remotion `AvatarGreeting`) com o nome
 * + voz-over Callirrhoe, e prepend ao deck. `opts.bundleDir` (serveUrl do Remotion)
 * é obrigatório; `opts.brand` casa a marca do deck. Retorna outPath.
 */
export async function personalizar(deckPath, nomeCompleto, outPath, opts = {}) {
  const nome = primeiroNome(nomeCompleto) || 'tudo bem';
  const bundleDir = opts.bundleDir;
  if (!bundleDir) throw new Error('bundleDir ausente (Remotion AvatarGreeting)');
  const brand = opts.brand || DEFAULT_BRAND;
  const work = await mkdtemp(path.join(os.tmpdir(), 'perso-'));
  try {
    const greetWav = path.join(work, 'greet.wav');
    await ttsSaudacao(nome, greetWav);
    const audioDur = await dur(greetWav);
    const { width, height, fps } = await probeVideo(deckPath);
    const durationInFrames = Math.ceil((audioDur + 0.6) * fps); // tempo justo (≈ voz + folga curta)

    // A saudação tem de bater PIXEL A PIXEL com o avatar_intro do deck p/ o
    // crossfade não duplicar logo/texto. O deck é desenhado em 1920×1080 e SAI
    // escalado (render_scale → ex. 720p). Renderizamos a saudação no MESMO design
    // (1920×1080) com o MESMO scale → mesma posição de tudo.
    const designW = opts.width || 1920;
    const designH = opts.height || 1080;
    const gScale = opts.scale || (height / designH); // deriva do output do deck (ex. 720/1080)

    // áudio do voice-over precisa de URL pública (o headless do Remotion faz fetch).
    const stamp = `${opts.jobId || 'p'}_${opts.colaboradorId || nome}`.replace(/[^A-Za-z0-9_-]/g, '');
    const audioSrc = await uploadAudio(await readFile(greetWav), `greetings/${stamp}.wav`);

    const props = { nome, audioSrc, brand, durationInFrames, fps, width: designW, height: designH };
    await ensureBrowser();
    const comp = await selectComposition({ serveUrl: bundleDir, id: 'AvatarGreeting', inputProps: props });
    const greetMp4 = path.join(work, 'greet.mp4');
    await renderMedia({ serveUrl: bundleDir, composition: comp, codec: 'h264', outputLocation: greetMp4, inputProps: props, chromiumOptions: { gl: 'swangle' }, ...(gScale && gScale !== 1 ? { scale: gScale } : {}) });

    // CROSSFADE saudação → avatar_intro: como a saudação usa o mesmo layout do
    // avatar_intro, o xfade faz "Olá, {nome}" derreter no título + avatar (fade-out
    // do nome / fade-in do título+mentora) na MESMA tela. O crossfade acontece no
    // tail da saudação (depois da voz), então a narração entra logo após o nome.
    const T = 0.6;
    const greetDur = durationInFrames / fps;
    const offset = Math.max(0.1, greetDur - T).toFixed(2);
    await exec(FFMPEG, ['-y', '-i', greetMp4, '-i', deckPath, '-filter_complex',
      `[0:v][1:v]xfade=transition=fade:duration=${T}:offset=${offset}[v];[0:a][1:a]acrossfade=d=${T}[a]`,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps), '-c:a', 'aac', '-ar', '48000', '-movflags', '+faststart', outPath]);
    return outPath;
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
