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
// Default ALINHADO à narração/avatar (gerar-video-modulo.ts usa o mesmo VIDEO_TTS_VOICE
// || 'Vindemiatrix') p/ a saudação soar como a MESMA mentora. Override por chamada via opts.voice.
const VOICE = process.env.VIDEO_TTS_VOICE || 'Vindemiatrix';
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

/** Gera o áudio "Olá, {nome}!" (Gemini TTS) num WAV. `voice` casa a voz da narração. */
async function ttsSaudacao(nome, outWav, voice = VOICE) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY ausente');
  // Direção ESPELHANDO o estilo da narração do avatar (NARRATION_STYLE_INTRO de
  // gerar-video-modulo): mesma mentora, "energia que prende a atenção" — nem
  // festivo (sobreatuava) nem sereno demais (ficava abaixo do avatar). O volume é
  // casado por loudnorm -14 LUFS (loudnormWav), igual ao deck masterizado.
  const styled = `Fale como uma mentora calorosa e próxima, em português do Brasil, cumprimentando alguém ao abrir uma conversa. Tom acolhedor e com energia que prende a atenção, ritmo natural com respiros leves — sem pressa e sem arrastar, e sem soar festivo:\n\nOlá, ${nome}. Que bom ter você aqui.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    contents: [{ parts: [{ text: styled }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
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

/** Normaliza a saudação ao MESMO loudness do deck masterizado (-14 LUFS) p/ a voz
 *  não ficar mais baixa que o avatar. Single-pass (clipe curto). Falha → cru. */
async function loudnormWav(inWav, outWav) {
  await exec(FFMPEG, ['-y', '-i', inWav, '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-ar', '24000', '-ac', '1', outWav]);
  return outWav;
}

async function probeVideo(deckPath) {
  const { stdout } = await exec(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,pix_fmt', '-of', 'json', deckPath]);
  const v = JSON.parse(stdout).streams[0];
  const [n, d] = (v.r_frame_rate || '30/1').split('/').map(Number);
  return { width: v.width, height: v.height, fps: d ? Math.round(n / d) : 30, pixFmt: v.pix_fmt || 'yuv420p' };
}

/** Sobe um buffer no bucket → URL pública. contentType default audio/wav. */
async function uploadBuffer(buf, key, contentType = 'audio/wav') {
  if (!SUPA || !SRK) throw new Error('SUPABASE_URL/SERVICE_ROLE_KEY ausentes (storage do greeting)');
  const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buf,
  });
  if (!r.ok) throw new Error(`upload ${key} ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return `${SUPA}/storage/v1/object/public/${BUCKET}/${key}`;
}
const uploadAudio = (buf, key) => uploadBuffer(buf, key, 'audio/wav');

/** Baixa um objeto do bucket → Buffer, ou null se não existir (cache miss). */
async function downloadFromStorage(key) {
  if (!SUPA || !SRK) return null;
  try {
    const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${key}`, {
      headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
    });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

/** Slug ASCII p/ a chave de cache (nome/voz). */
function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
}

/**
 * Renderiza a cena de SAUDAÇÃO (TTS "Olá, {nome}" + Remotion `AvatarGreeting`),
 * escalada igual ao output do deck. É a parte CARA (Vertex TTS + Chromium).
 */
async function renderGreeting(outMp4, p) {
  const work = p.work;
  const greetRaw = path.join(work, 'greet.wav');
  await ttsSaudacao(p.nome, greetRaw, p.voice);
  // Casa o volume da saudação ao deck masterizado (-14 LUFS). Se falhar, usa o cru.
  const greetNorm = path.join(work, 'greet-norm.wav');
  const greetWav = await loudnormWav(greetRaw, greetNorm).then(() => greetNorm).catch(() => greetRaw);
  const audioDur = await dur(greetWav);
  const TAIL = 0.3;
  const durationInFrames = Math.ceil((audioDur + TAIL) * p.fps);
  // A saudação é desenhada no MESMO design do deck (1920×1080) e sai com o MESMO
  // scale (output do deck, ex. 720p) → bate pixel a pixel com o avatar_intro.
  const gScale = p.scale || (p.height / p.designH);
  // áudio do voice-over precisa de URL pública (o headless do Remotion faz fetch).
  const stamp = `${p.colaboradorId || slug(p.nome)}_${slug(p.voice)}`.replace(/[^A-Za-z0-9_-]/g, '');
  const audioSrc = await uploadAudio(await readFile(greetWav), `greetings/${stamp}.wav`);
  const props = { nome: p.nome, audioSrc, brand: p.brand, durationInFrames, fps: p.fps, width: p.designW, height: p.designH };
  await ensureBrowser();
  const comp = await selectComposition({ serveUrl: p.bundleDir, id: 'AvatarGreeting', inputProps: props });
  await renderMedia({ serveUrl: p.bundleDir, composition: comp, codec: 'h264', outputLocation: outMp4, inputProps: props, chromiumOptions: { gl: 'swangle' }, ...(gScale && gScale !== 1 ? { scale: gScale } : {}) });
  return outMp4;
}

/**
 * Saudação CACHEADA por (colaborador × voz × nome × formato): grava o greetMp4
 * 1× no storage e o REUTILIZA em todos os materiais do usuário — pula TTS+render
 * (caros, rate-limited) nas próximas células. Chave determinística (sem tabela);
 * nome/voz/formato na chave invalidam sozinhos. Sem colaboradorId → sempre gera.
 */
async function getOrCreateGreeting(outMp4, p) {
  const key = `greetings-cache/${p.colaboradorId}__${slug(p.voice)}__${slug(primeiroNome(p.nome))}__${p.width}x${p.height}.mp4`;
  if (p.colaboradorId) {
    const buf = await downloadFromStorage(key);
    if (buf && buf.length > 2000) { await writeFile(outMp4, buf); return { cached: true, key }; }
  }
  await renderGreeting(outMp4, p);
  if (p.colaboradorId) await uploadBuffer(await readFile(outMp4), key, 'video/mp4').catch(() => {});
  return { cached: false, key };
}

/**
 * Personaliza: obtém a SAUDAÇÃO do usuário (cache → render) e faz crossfade com o
 * avatar_intro do deck. `opts.bundleDir` obrigatório; `opts.brand` casa a marca.
 */
export async function personalizar(deckPath, nomeCompleto, outPath, opts = {}) {
  const nome = primeiroNome(nomeCompleto) || 'tudo bem';
  const bundleDir = opts.bundleDir;
  if (!bundleDir) throw new Error('bundleDir ausente (Remotion AvatarGreeting)');
  const brand = opts.brand || DEFAULT_BRAND;
  const work = await mkdtemp(path.join(os.tmpdir(), 'perso-'));
  try {
    const { width, height, fps } = await probeVideo(deckPath);
    const greetMp4 = path.join(work, 'greet.mp4');
    const g = await getOrCreateGreeting(greetMp4, {
      nome, voice: opts.voice || VOICE, brand, width, height, fps, work, bundleDir,
      colaboradorId: opts.colaboradorId, designW: opts.width || 1920, designH: opts.height || 1080, scale: opts.scale,
    });
    if (g.cached) console.log(`[personalizar] saudação REUSADA do cache (${g.key})`);

    // CROSSFADE saudação → avatar_intro. offset = duração REAL do greetMp4 (cacheado
    // ou novo) − T, p/ o nome derreter no título na mesma tela.
    const T = 0.3;
    const greetDur = await dur(greetMp4);
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
