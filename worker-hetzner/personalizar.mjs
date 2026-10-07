/**
 * Personalização nominal (Rota A) — roda na MESMA box de render.
 *
 * Prepend de uma cena de SAUDAÇÃO "Olá, {nome}" ao deck genérico da célula:
 *   • renderizada via Remotion (composição `AvatarGreeting` do mesmo bundle) →
 *     mesmo padrão visual do deck (fundo, logo, eyebrow, tipografia);
 *   • "Olá, {nome}" entra à esquerda + a FOTO da mentora desliza pela direita
 *     (estática → reuso total, sem lip-sync nem custo HeyGen);
 *   • voz-over "Olá, {nome}. Que bom ter você aqui." SINTETIZADO PELO APP no Vertex (voz do
 *     elenco, a mesma do corpo do vídeo) e lido do Storage; esta box não sintetiza (ver
 *     `saudacao-audio.mjs` e `audioDaSaudacao`).
 * O deck NÃO fala o nome → continua reutilizável por todos da célula; só esta
 * cena é por pessoa.
 *
 * Node + ffmpeg + @remotion/renderer (já na imagem do worker). Precisa de
 * SUPABASE_URL/SERVICE_ROLE_KEY (ler o áudio da saudação e hospedar o áudio do
 * voice-over como URL pública p/ o <Audio> do Remotion) e de VOZ_VERSAO.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { selectComposition, renderMedia, ensureBrowser } from '@remotion/renderer';
import { BUCKET_SAUDACAO, chaveDoAudioDaSaudacao, primeiroNome, slugSaudacao } from './saudacao-audio.mjs';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const SUPA = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = BUCKET_SAUDACAO;
const DEFAULT_BRAND = { primary: '#6D28D9', secondary: '#0EA5E9', background: '#0B1020', font: 'Inter, system-ui, sans-serif' };

// Reexportado: o worker e o trigger importam `primeiroNome` daqui. Vive em `saudacao-audio.mjs` para o app usar o MESMO
// (o nome falado no áudio e o da chave do objeto têm que sair da mesma função).
export { primeiroNome };

/**
 * A saudação NÃO é mais sintetizada aqui (07/10/2026): o app a faz no Vertex, na voz do elenco, e grava o mp3 em
 * `chaveDoAudioDaSaudacao`. Esta função só LÊ. Sem o arquivo, lança `SaudacaoAusenteError`, e o chamador deixa a pessoa
 * sem nominal (o deck genérico segue no ar) e registra a degradação. NÃO há fallback para outro sintetizador: o AI Studio
 * é um sorteio por pessoa que soa como outra locutora, e cair nele em silêncio reabre exatamente a queixa de tom.
 */
export class SaudacaoAusenteError extends Error {
  constructor(chave) {
    super(`saudação em Vertex ausente (${chave}): o app não a gerou ainda, ou a versão do elenco da box (${process.env.VOZ_VERSAO || 'sem VOZ_VERSAO'}) não é a do app`);
    this.name = 'SaudacaoAusenteError';
    this.chave = chave;
  }
}

/** Áudio (mp3) da saudação da pessoa. `opts.saudacaoWav` (Buffer) é para teste/script; em produção vem do Storage. */
async function audioDaSaudacao(p) {
  if (p.saudacaoWav) return Buffer.from(p.saudacaoWav);
  if (!p.colaboradorId) throw new Error('saudação: colaboradorId ausente (a chave do áudio é por pessoa)');
  const versao = process.env.VOZ_VERSAO;
  if (!versao) throw new Error('VOZ_VERSAO ausente: sem a versão do elenco a chave do áudio da saudação não existe');
  const chave = chaveDoAudioDaSaudacao({ colaboradorId: p.colaboradorId, nome: p.nome, versao });
  const buf = await downloadFromStorage(chave);
  if (!buf || buf.length < 2000) throw new SaudacaoAusenteError(chave);
  return buf;
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

/** Slug ASCII p/ a chave de cache (nome). */
const slug = slugSaudacao;

/**
 * Renderiza a cena de SAUDAÇÃO (voz do `p.wav` + Remotion `AvatarGreeting`),
 * escalada igual ao output do deck. É a parte CARA (Chromium).
 */
async function renderGreeting(outMp4, p) {
  const work = p.work;
  const greetRaw = path.join(work, 'greet-in'); // mp3 do app (ou wav de script): o ffmpeg reconhece pelo conteúdo
  await writeFile(greetRaw, p.wav);
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
  const stamp = `${p.colaboradorId || slug(p.nome)}_${p.audioId}`.replace(/[^A-Za-z0-9_-]/g, '');
  const audioSrc = await uploadAudio(await readFile(greetWav), `greetings/${stamp}.wav`);
  const props = { nome: p.nome, audioSrc, brand: p.brand, durationInFrames, fps: p.fps, width: p.designW, height: p.designH };
  await ensureBrowser();
  const comp = await selectComposition({ serveUrl: p.bundleDir, id: 'AvatarGreeting', inputProps: props });
  await renderMedia({ serveUrl: p.bundleDir, composition: comp, codec: 'h264', outputLocation: outMp4, inputProps: props, chromiumOptions: { gl: 'swangle' }, ...(gScale && gScale !== 1 ? { scale: gScale } : {}) });
  return outMp4;
}

/**
 * Saudação CACHEADA por (colaborador × ÁUDIO × nome × formato): grava o greetMp4
 * 1× no storage e o REUTILIZA em todos os materiais do usuário — pula o render
 * (caro, rate-limited) nas próximas células. Chave determinística (sem tabela).
 *
 * O ÁUDIO entra na chave pelo hash dos seus bytes (07/10/2026), e por isso ele é lido ANTES do cache: trocar a voz, o
 * modelo ou só re-sintetizar a saudação gera outro hash e o mp4 antigo deixa de ser servido. Antes a chave levava o nome da
 * voz, o modelo e `VOZ_VERSAO`, e uma saudação do AI Studio sorteada uma vez valia para sempre. As antigas (`__aoede__…`)
 * não casam mais com nenhuma chave nova: ficam órfãs no bucket e nunca são reservidas.
 * Sem colaboradorId → sempre gera.
 */
async function getOrCreateGreeting(outMp4, p) {
  const wav = await audioDaSaudacao(p);
  const audioId = createHash('sha1').update(wav).digest('hex').slice(0, 10);
  const key = `greetings-cache/${p.colaboradorId}__vertex-${audioId}__${slug(primeiroNome(p.nome))}__${p.width}x${p.height}.mp4`;
  if (p.colaboradorId) {
    const buf = await downloadFromStorage(key);
    if (buf && buf.length > 2000) { await writeFile(outMp4, buf); return { cached: true, key }; }
  }
  await renderGreeting(outMp4, { ...p, wav, audioId });
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
      nome, brand, width, height, fps, work, bundleDir, saudacaoWav: opts.saudacaoWav,
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
