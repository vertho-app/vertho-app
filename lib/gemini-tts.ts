/**
 * Orquestração do Gemini TTS (geração de áudio).
 *
 * Usado pelo "conteúdo final" em áudio (podcast) e pela narração de vídeo/
 * devolutiva. O Gemini TTS retorna PCM 16-bit 24kHz mono (audio/L16); a DSP de
 * áudio (mix de vinheta, masterização, encode MP3) vive em `./tts/audio-dsp` e a
 * limpeza/branding de texto em `./tts/narration-text` (M1 — este arquivo ficou só
 * com a orquestração + re-export da API pública, pra não quebrar callers).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fadePcm16, silencePcm, wavToMonoPcm16AtRate, exportPodcastMp3FromPcm } from './tts/audio-dsp';
import { extractNarration, ensurePodcastBrandNarration, isMultiSpeakerText, splitNarrationForTts } from './tts/narration-text';

// Re-export da API pública (callers continuam importando de '@/lib/gemini-tts').
export { extractNarration, ensurePodcastBrandNarration } from './tts/narration-text';
export { exportPodcastMp3FromPcm } from './tts/audio-dsp';

const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
const VOICE = process.env.GEMINI_TTS_VOICE || 'Charon'; // masculina, grave/madura
const MENTOR_VOICE = process.env.GEMINI_TTS_MENTOR_VOICE || 'Charon';
const CAMPO_VOICE = process.env.GEMINI_TTS_CAMPO_VOICE || 'Kore';
const brandStingCache = new Map<string, Buffer>();

export type PodcastAudioFile = {
  buffer: Buffer;
  contentType: 'audio/mpeg';
  extension: 'mp3';
};

/** Vinheta de marca (intro/outro) do podcast, reamostrada e cacheada por sample-rate. */
function brandStingPcm(sampleRate: number, variant: 'intro' | 'outro'): Buffer {
  const cacheKey = `${variant}:${sampleRate}`;
  const cached = brandStingCache.get(cacheKey);
  if (cached) return cached;

  const assetPath = variant === 'intro'
    ? path.join(process.cwd(), 'public', 'audio', 'podcast', 'mentorIA-abertura.wav')
    : path.join(process.cwd(), 'public', 'audio', 'podcast', 'mentorIA-encerramento.wav');
  const wav = readFileSync(assetPath);
  const pcm = wavToMonoPcm16AtRate(wav, sampleRate);
  brandStingCache.set(cacheKey, pcm);
  return pcm;
}

/** Prepend/append das vinhetas de marca à narração (PCM), com fades e silêncios. */
export function addPodcastBrandSting(pcm: Buffer, sampleRate: number): Buffer {
  const intro = fadePcm16(brandStingPcm(sampleRate, 'intro'), sampleRate, 0, 0.75);
  const narration = fadePcm16(pcm, sampleRate, 0.12, 0.08);
  const outro = fadePcm16(brandStingPcm(sampleRate, 'outro'), sampleRate, 0.3, 0);

  return Buffer.concat([
    intro,
    silencePcm(0.55, sampleRate),
    narration,
    silencePcm(0.35, sampleRate),
    outro,
  ]);
}

/** Lê "audio/L16;rate=24000" e devolve o sampleRate (default 24000). */
function rateFromMime(mime?: string): number {
  const m = mime?.match(/rate=(\d+)/i);
  return m ? parseInt(m[1], 10) : 24000;
}

const TTS_MAX_RETRIES = Number(process.env.GEMINI_TTS_RETRIES) || 4;

/**
 * Chamada crua ao Gemini TTS: texto+direção de estilo → PCM 16-bit mono.
 * RETRY com backoff exponencial em 429 (rate-limit) e 503 (indisponível) — o TTS
 * preview tem limites apertados de RPM/RPD; respeita `Retry-After` quando vier.
 */
async function ttsToPcm(prompt: string, voiceName: string, attempt = 0): Promise<{ pcm: Buffer; sampleRate: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 170_000);
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Gemini TTS: timeout (170s)');
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if ((res.status === 429 || res.status === 503) && attempt < TTS_MAX_RETRIES) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const backoff = Math.min(30_000, 2_000 * 2 ** attempt); // 2s, 4s, 8s, 16s
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff;
    console.warn(`Gemini TTS ${res.status} — retry em ${Math.round(wait / 1000)}s (tentativa ${attempt + 1}/${TTS_MAX_RETRIES})`);
    await new Promise((r) => setTimeout(r, wait));
    return ttsToPcm(prompt, voiceName, attempt + 1);
  }
  if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) throw new Error('Gemini TTS: resposta sem áudio');
  return { pcm: Buffer.from(b64, 'base64'), sampleRate: rateFromMime(part.inlineData.mimeType) };
}

// Direção de estilo default (devolutiva comportamental): mensagem pessoal do
// mentor, ritmo moderado/reflexivo. O caminho de VÍDEO passa `opts.style` com um
// ritmo mais ágil (ver trigger/gerar-video-modulo.ts).
const NARRATION_STYLE_DEFAULT = 'Narre em português do Brasil, com voz acolhedora, segura e íntima, ritmo moderado e pausas reflexivas naturais, como um mentor falando diretamente com a pessoa';

/**
 * Narração LIMPA (sem vinheta nem frase de encerramento de podcast). Para usos
 * como a devolutiva comportamental e a narração de vídeo. `texto` deve ser a
 * narração limpa. Narra em TRECHOS (mesma voz) e concatena o PCM com uma pausa
 * curta entre eles — mantém voz e volume consistentes do início ao fim.
 */
export async function generateNarrationAudio(texto: string, opts: { voice?: string; style?: string } = {}): Promise<PodcastAudioFile> {
  if (!texto?.trim()) throw new Error('texto de narração vazio');
  const voice = opts.voice || VOICE;
  const styleDirective = opts.style || NARRATION_STYLE_DEFAULT;
  const trechos = splitNarrationForTts(texto);

  const partes: Buffer[] = [];
  let sampleRate = 24000;
  for (const trecho of trechos) {
    const styled = `${styleDirective}:\n\n${trecho}`;
    const { pcm, sampleRate: sr } = await ttsToPcm(styled, voice);
    sampleRate = sr;
    if (partes.length) {
      // ~220ms de silêncio entre trechos (PCM 16-bit mono): respiro natural.
      partes.push(Buffer.alloc(Math.round(sampleRate * 0.22) * 2));
    }
    partes.push(pcm);
  }

  const full = Buffer.concat(partes);
  return {
    buffer: exportPodcastMp3FromPcm(full, sampleRate),
    contentType: 'audio/mpeg',
    extension: 'mp3',
  };
}

/**
 * Narra o texto e devolve um MP3 pronto para distribuição (PODCAST: com vinhetas
 * de marca). Lança em erro/sem chave — o caller decide o fallback. `texto` deve
 * ser a narração limpa (use extractNarration).
 */
export async function generatePodcastAudio(texto: string): Promise<PodcastAudioFile> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  if (!texto?.trim()) throw new Error('texto de narração vazio');

  const textoComMarca = ensurePodcastBrandNarration(texto);
  const multiSpeaker = isMultiSpeakerText(textoComMarca);
  // Direção de estilo (não é falada — orienta a entrega da voz prebuilt).
  const styled = multiSpeaker
    ? `TTS the following conversation in Brazilian Portuguese. Speaker Mentor is calm, consultative, experienced and clear. Speaker Campo is practical, direct and grounded in field reality. Keep a professional, adult tone and natural turn-taking:\n\n${textoComMarca}`
    : `Narre em português do Brasil, com voz masculina de meia-idade, tom acolhedor, seguro e íntimo, ritmo moderado e pausas reflexivas naturais:\n\n${textoComMarca}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: styled }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: multiSpeaker
        ? {
            languageCode: 'pt-BR',
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                { speaker: 'Mentor', voiceConfig: { prebuiltVoiceConfig: { voiceName: MENTOR_VOICE } } },
                { speaker: 'Campo', voiceConfig: { prebuiltVoiceConfig: { voiceName: CAMPO_VOICE } } },
              ],
            },
          }
        : { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
    },
  };

  // TTS de roteiro longo pode levar dezenas de segundos. Aborta limpo em 170s.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 170_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Gemini TTS: timeout (170s)');
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini TTS ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) throw new Error('Gemini TTS: resposta sem áudio');
  const pcm = Buffer.from(b64, 'base64');
  const sampleRate = rateFromMime(part.inlineData.mimeType);
  const mixedPcm = addPodcastBrandSting(pcm, sampleRate);
  return {
    buffer: exportPodcastMp3FromPcm(mixedPcm, sampleRate),
    contentType: 'audio/mpeg',
    extension: 'mp3',
  };
}
