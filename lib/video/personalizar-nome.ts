/**
 * Personalização NOMINAL por pessoa — camada barata sobre o deck por CÉLULA.
 *
 * O deck (renderizado 1× por célula pelo Remotion) NÃO contém o nome. Aqui montamos,
 * por ffmpeg (sem re-render Remotion), uma SAUDAÇÃO de duração FIXA — card da marca +
 * `drawtext` do nome + áudio TTS ("Olá, {nome}") — e a PREPENDEMOS ao deck. O slot
 * fixo evita o overflow de timeline que travava o "render-once + N-áudios" completo.
 *
 * PURO (node child_process/fs) — sem Next, sem rede. O áudio da saudação é INPUT
 * (o chamador gera via gemini-tts), então isto é testável offline com um mp3 qualquer.
 *
 * Custo: TTS ~$0.0005/pessoa + ffmpeg (segundos). O render — 67% do custo — fica
 * travado no nível de célula. Ver migration 141 (videos_personalizados).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

/** Fonte default por plataforma (Debian do worker tem fonts-liberation). */
function fontePadrao(): string {
  if (process.env.PERSONALIZA_FONT) return process.env.PERSONALIZA_FONT;
  return process.platform === 'win32'
    ? 'C:/Windows/Fonts/arialbd.ttf'
    : '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf';
}

/** Primeiro nome, capitalizado. "MARIA DA SILVA" → "Maria". */
export function primeiroNome(nome: string): string {
  const t = String(nome || '').trim().split(/\s+/)[0] || '';
  return t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : '';
}

export interface DeckParams {
  width: number;
  height: number;
  fps: number;
  pixFmt: string;
  hasAudio: boolean;
  sampleRate: number;
  channels: number;
  durationSec: number;
}

/** Lê os parâmetros do deck (p/ encodar a saudação igual → concat barato). */
export async function probeDeck(deckPath: string): Promise<DeckParams> {
  const { stdout } = await exec(FFPROBE, [
    '-v', 'error', '-print_format', 'json',
    '-show_entries', 'stream=codec_type,width,height,r_frame_rate,pix_fmt,sample_rate,channels:format=duration',
    deckPath,
  ]);
  const j = JSON.parse(stdout);
  const v = (j.streams || []).find((s: any) => s.codec_type === 'video') || {};
  const a = (j.streams || []).find((s: any) => s.codec_type === 'audio');
  const [n, d] = String(v.r_frame_rate || '30/1').split('/').map(Number);
  return {
    width: v.width || 1280,
    height: v.height || 720,
    fps: Math.round((n || 30) / (d || 1)),
    pixFmt: v.pix_fmt || 'yuv420p',
    hasAudio: !!a,
    sampleRate: a ? Number(a.sample_rate) || 44100 : 44100,
    channels: a ? Number(a.channels) || 2 : 2,
    durationSec: Number(j.format?.duration) || 0,
  };
}

/** Escapa um caminho p/ um valor de filtro ffmpeg (barras normais + `:` literal). */
function escFiltro(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

export interface BrandSaudacao {
  background?: string; // hex sem '#', default navy Vertho
  text?: string;       // hex sem '#', default branco
}

/**
 * Monta a saudação (card {sec}s: fundo da marca + nome + áudio TTS), encodada com
 * os MESMOS parâmetros do deck (p/ o concat sair barato).
 */
export async function montarSaudacao(opts: {
  outPath: string;
  nome: string;
  greetingAudioPath: string;
  deck: Pick<DeckParams, 'width' | 'height' | 'fps' | 'pixFmt' | 'sampleRate' | 'channels'>;
  brand?: BrandSaudacao;
  seconds?: number;
  fontPath?: string;
  workdir: string;
}): Promise<string> {
  const sec = opts.seconds ?? 3;
  const bg = (opts.brand?.background || '0B1F3A').replace('#', '');
  const fg = (opts.brand?.text || 'FFFFFF').replace('#', '');
  const font = opts.fontPath || fontePadrao();
  const fs = Math.round(opts.deck.height / 9);
  const texto = `Olá, ${primeiroNome(opts.nome)}`;

  // Texto via arquivo (evita escape de acento/aspas no filtro).
  const nomeFile = path.join(opts.workdir, 'nome.txt');
  await writeFile(nomeFile, texto, 'utf8');

  const vf =
    `[0:v]drawtext=fontfile='${escFiltro(font)}':textfile='${escFiltro(nomeFile)}'` +
    `:fontcolor=0x${fg}:fontsize=${fs}:x=(w-text_w)/2:y=(h-text_h)/2,format=${opts.deck.pixFmt}[v];` +
    `[1:a]apad,atrim=0:${sec},asetpts=N/SR/TB[a]`;

  await exec(FFMPEG, [
    '-y',
    '-f', 'lavfi', '-i', `color=c=0x${bg}:s=${opts.deck.width}x${opts.deck.height}:d=${sec}:r=${opts.deck.fps}`,
    '-i', opts.greetingAudioPath,
    '-filter_complex', vf,
    '-map', '[v]', '-map', '[a]',
    '-t', String(sec),
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', opts.deck.pixFmt, '-r', String(opts.deck.fps),
    '-c:a', 'aac', '-ar', String(opts.deck.sampleRate), '-ac', String(opts.deck.channels),
    opts.outPath,
  ]);
  return opts.outPath;
}

/** Concat com stream-copy (instantâneo); usado primeiro. */
async function concatCopy(greeting: string, deck: string, out: string, workdir: string): Promise<void> {
  const list = path.join(workdir, 'concat.txt');
  await writeFile(list, `file '${greeting.replace(/'/g, "'\\''")}'\nfile '${deck.replace(/'/g, "'\\''")}'\n`, 'utf8');
  await exec(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
}

/** Concat com re-encode (robusto); fallback quando o copy falha/glitcha. */
async function concatReencode(greeting: string, deck: string, out: string, deck2: DeckParams): Promise<void> {
  await exec(FFMPEG, [
    '-y', '-i', greeting, '-i', deck,
    '-filter_complex', '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]',
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', deck2.pixFmt,
    '-c:a', 'aac', '-ar', String(deck2.sampleRate), '-ac', String(deck2.channels),
    '-movflags', '+faststart', out,
  ]);
}

export interface ResultadoPersonalizacao {
  outPath: string;
  greetingPath: string;
  reencoded: boolean;
  durationSec: number;
}

/**
 * Personaliza um deck com a saudação nominal. Tenta concat stream-copy (instantâneo);
 * se a junção falhar (encoders divergentes), cai pro re-encode (ainda barato vs render).
 */
export async function personalizarComNome(opts: {
  deckPath: string;
  outPath: string;
  nome: string;
  greetingAudioPath: string;
  brand?: BrandSaudacao;
  seconds?: number;
  fontPath?: string;
  workdir?: string;
}): Promise<ResultadoPersonalizacao> {
  const workdir = opts.workdir || (await mkdtemp(path.join(tmpdir(), 'perso-')));
  const deck = await probeDeck(opts.deckPath);
  const greeting = path.join(workdir, 'greeting.mp4');
  await montarSaudacao({
    outPath: greeting, nome: opts.nome, greetingAudioPath: opts.greetingAudioPath,
    deck, brand: opts.brand, seconds: opts.seconds, fontPath: opts.fontPath, workdir,
  });

  let reencoded = false;
  try {
    await concatCopy(greeting, opts.deckPath, opts.outPath, workdir);
  } catch {
    reencoded = true;
    await concatReencode(greeting, opts.deckPath, opts.outPath, deck);
  }

  const out = await probeDeck(opts.outPath);
  await unlink(path.join(workdir, 'nome.txt')).catch(() => {});
  await unlink(path.join(workdir, 'concat.txt')).catch(() => {});
  return { outPath: opts.outPath, greetingPath: greeting, reencoded, durationSec: out.durationSec };
}
