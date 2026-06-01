/**
 * Geração de áudio (podcast) via Gemini TTS.
 *
 * Usado pelo "conteúdo final" de formato áudio: transforma o roteiro de podcast
 * (bloco de narração limpa) em um MP3 narrado. Voz masculina de meia-idade,
 * pt-BR, acolhedora e segura — calibrada pela voz prebuilt + direção de estilo.
 *
 * Gemini TTS retorna PCM 16-bit 24kHz mono (audio/L16). Mixamos vinhetas,
 * masterizamos para podcast e exportamos MP3 real 44.1kHz estéreo/192kbps.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as lamejs from '@breezystack/lamejs';

const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
const VOICE = process.env.GEMINI_TTS_VOICE || 'Charon'; // masculina, grave/madura
const MENTOR_VOICE = process.env.GEMINI_TTS_MENTOR_VOICE || 'Charon';
const CAMPO_VOICE = process.env.GEMINI_TTS_CAMPO_VOICE || 'Kore';
const BRAND_OPENING_LINE = 'Este é o MentorIA na prática: uma conversa curta sobre desenvolvimento profissional aplicável no seu dia a dia.';
const BRAND_CLOSING_LINE = 'Na Vertho, desenvolvimento profissional não é conceito solto. É prática observável, uma semana de cada vez.';
const brandStingCache = new Map<string, Buffer>();
const MP3_SAMPLE_RATE = 44100;
const MP3_BITRATE_KBPS = 192;
const TARGET_LUFS = -14;
const TRUE_PEAK_DB = -1.5;

export type PodcastAudioFile = {
  buffer: Buffer;
  contentType: 'audio/mpeg';
  extension: 'mp3';
};

/** Extrai o bloco de NARRAÇÃO LIMPA do roteiro TTS; remove título, headers e tags. */
export function extractNarration(roteiro: string): string {
  if (!roteiro) return '';
  let txt = roteiro;

  // Roteiros em dupla usam este bloco para preservar speaker labels no TTS.
  const multiSpeakerMatch = roteiro.match(/=+\s*TTS MULTI-SPEAKER\s*\(LIMPO\)\s*=+([\s\S]*?)$/i);
  if (multiSpeakerMatch) {
    return cleanNarrationText(multiSpeakerMatch[1], { keepSpeakerLabels: true });
  }

  // Pega o trecho entre "=== NARRAÇÃO (TEXTO LIMPO) ===" e o próximo "===".
  const limpoMatch = roteiro.match(/=+\s*NARRA[ÇC][ÃA]O\s*\(TEXTO LIMPO\)\s*=+([\s\S]*?)(?:\n=+\s*NARRA|$)/i);
  if (limpoMatch) {
    txt = limpoMatch[1];
  } else {
    // Sem marcadores: remove a linha TÍTULO e quaisquer headers "=== ... ===".
    txt = roteiro.replace(/^\s*T[ÍI]TULO:.*$/im, '').replace(/^=+.*=+\s*$/gim, '');
  }

  return cleanNarrationText(txt);
}

function cleanNarrationText(txt: string, opts: { keepSpeakerLabels?: boolean } = {}): string {
  let cleaned = txt
    .replace(/<break[^>]*\/?>/gi, '') // tags de pausa (não usadas pelo Gemini)
    .replace(/\*([^*]+)\*/g, '$1')    // ênfase em asteriscos
    .replace(/[#>*_`]/g, '')           // resíduos de markdown
    .replace(/^\s*[\[(].*(vinheta|som|m[úu]sica|fade|produção).*[)\]]\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (opts.keepSpeakerLabels) {
    cleaned = cleaned
      .replace(/^VOZ\s*1\s*:/gim, 'Mentor:')
      .replace(/^VOZ\s*2\s*:/gim, 'Campo:');
  }
  return cleaned;
}

function isMultiSpeakerText(texto: string): boolean {
  return /^\s*Mentor\s*:/im.test(texto) && /^\s*Campo\s*:/im.test(texto);
}

export function ensurePodcastBrandNarration(texto: string): string {
  const clean = stripPodcastOpeningNarration(texto.trim());
  const hasClosing = /desenvolvimento profissional n[ãa]o [ée] conceito solto/i.test(clean)
    || /pr[áa]tica observ[áa]vel/i.test(clean);

  if (isMultiSpeakerText(clean)) {
    return [
      clean,
      hasClosing ? null : `Mentor: ${BRAND_CLOSING_LINE}`,
    ].filter(Boolean).join('\n');
  }

  return [
    clean,
    hasClosing ? null : BRAND_CLOSING_LINE,
  ].filter(Boolean).join('\n\n');
}

function stripPodcastOpeningNarration(texto: string): string {
  const openingLine = escapeRegExp(BRAND_OPENING_LINE);
  return texto
    .replace(new RegExp(`^\\s*(?:Mentor\\s*:\\s*)?${openingLine}\\s*(?:\\r?\\n)+`, 'i'), '')
    .replace(/^\s*(?:Mentor\s*:\s*)?Este é o MentorIA na prática:.*(?:\r?\n)+/i, '')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bits = 16): Buffer {
  const blockAlign = (channels * bits) / 8;
  const byteRate = sampleRate * blockAlign;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function silencePcm(seconds: number, sampleRate: number): Buffer {
  return Buffer.alloc(Math.max(0, Math.round(seconds * sampleRate)) * 2);
}

function fadePcm16(pcm: Buffer, sampleRate: number, fadeInSeconds: number, fadeOutSeconds: number): Buffer {
  const out = Buffer.from(pcm);
  const frames = Math.floor(out.length / 2);
  const fadeInFrames = Math.min(frames, Math.max(0, Math.round(fadeInSeconds * sampleRate)));
  const fadeOutFrames = Math.min(frames, Math.max(0, Math.round(fadeOutSeconds * sampleRate)));

  for (let i = 0; i < fadeInFrames; i++) {
    const gain = i / Math.max(1, fadeInFrames);
    out.writeInt16LE(Math.round(out.readInt16LE(i * 2) * gain), i * 2);
  }

  for (let i = 0; i < fadeOutFrames; i++) {
    const frame = frames - fadeOutFrames + i;
    const gain = 1 - (i / Math.max(1, fadeOutFrames));
    out.writeInt16LE(Math.round(out.readInt16LE(frame * 2) * gain), frame * 2);
  }

  return out;
}

function parsePcm16Wav(wav: Buffer): { channels: number; sampleRate: number; pcm: Buffer } {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Vinheta WAV inválida');
  }

  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let pcm: Buffer | null = null;

  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;

    if (id === 'fmt ') {
      audioFormat = wav.readUInt16LE(start);
      channels = wav.readUInt16LE(start + 2);
      sampleRate = wav.readUInt32LE(start + 4);
      bitsPerSample = wav.readUInt16LE(start + 14);
    } else if (id === 'data') {
      pcm = wav.subarray(start, end);
    }

    offset = end + (size % 2);
  }

  if (audioFormat !== 1 || bitsPerSample !== 16 || !channels || !sampleRate || !pcm) {
    throw new Error('Vinheta WAV precisa ser PCM 16-bit');
  }

  return { channels, sampleRate, pcm };
}

function sampleAt(pcm: Buffer, frame: number, channel: number, channels: number): number {
  const offset = (frame * channels + channel) * 2;
  return offset + 1 < pcm.length ? pcm.readInt16LE(offset) : 0;
}

function wavToMonoPcm16AtRate(wav: Buffer, targetRate: number): Buffer {
  const source = parsePcm16Wav(wav);
  const sourceFrames = Math.floor(source.pcm.length / (source.channels * 2));
  const targetFrames = Math.max(1, Math.round(sourceFrames * targetRate / source.sampleRate));
  const out = Buffer.alloc(targetFrames * 2);

  for (let i = 0; i < targetFrames; i++) {
    const sourcePos = i * source.sampleRate / targetRate;
    const leftFrame = Math.min(sourceFrames - 1, Math.floor(sourcePos));
    const rightFrame = Math.min(sourceFrames - 1, leftFrame + 1);
    const ratio = sourcePos - leftFrame;
    let mixed = 0;

    for (let ch = 0; ch < source.channels; ch++) {
      const left = sampleAt(source.pcm, leftFrame, ch, source.channels);
      const right = sampleAt(source.pcm, rightFrame, ch, source.channels);
      mixed += left + (right - left) * ratio;
    }

    const mono = Math.max(-32768, Math.min(32767, Math.round(mixed / source.channels)));
    out.writeInt16LE(mono, i * 2);
  }

  return out;
}

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

function pcm16Peak(pcm: Buffer): number {
  let peak = 0;
  for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
    peak = Math.max(peak, Math.abs(pcm.readInt16LE(offset)) / 32768);
  }
  return peak;
}

function pcm16Rms(pcm: Buffer): number {
  let sumSquares = 0;
  let count = 0;
  const gate = 10 ** (-70 / 20);

  for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
    const sample = pcm.readInt16LE(offset) / 32768;
    if (Math.abs(sample) < gate) continue;
    sumSquares += sample * sample;
    count++;
  }

  return count ? Math.sqrt(sumSquares / count) : 0;
}

function masterPodcastPcm(pcm: Buffer): Buffer {
  const peak = pcm16Peak(pcm);
  const rms = pcm16Rms(pcm);
  if (!peak || !rms) return pcm;

  const currentLufsApprox = 20 * Math.log10(rms);
  const loudnessGain = 10 ** ((TARGET_LUFS - currentLufsApprox) / 20);
  const peakCeiling = 10 ** (TRUE_PEAK_DB / 20);
  const peakGain = peakCeiling / peak;
  const gain = Math.min(loudnessGain, peakGain);
  const out = Buffer.alloc(pcm.length);

  for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
    const sample = Math.round(pcm.readInt16LE(offset) * gain);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), offset);
  }

  return out;
}

function resampleMonoPcm16(pcm: Buffer, sourceRate: number, targetRate: number): Int16Array {
  const sourceFrames = Math.floor(pcm.length / 2);
  const targetFrames = Math.max(1, Math.round(sourceFrames * targetRate / sourceRate));
  const out = new Int16Array(targetFrames);

  for (let i = 0; i < targetFrames; i++) {
    const sourcePos = i * sourceRate / targetRate;
    const leftFrame = Math.min(sourceFrames - 1, Math.floor(sourcePos));
    const rightFrame = Math.min(sourceFrames - 1, leftFrame + 1);
    const ratio = sourcePos - leftFrame;
    const left = pcm.readInt16LE(leftFrame * 2);
    const right = pcm.readInt16LE(rightFrame * 2);
    out[i] = Math.max(-32768, Math.min(32767, Math.round(left + (right - left) * ratio)));
  }

  return out;
}

function encodeMp3Stereo(mono: Int16Array): Buffer {
  const encoder = new lamejs.Mp3Encoder(2, MP3_SAMPLE_RATE, MP3_BITRATE_KBPS);
  const chunks: Buffer[] = [];
  const blockSize = 1152;

  for (let i = 0; i < mono.length; i += blockSize) {
    const left = mono.subarray(i, i + blockSize);
    const right = mono.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(left, right);
    if (encoded.length) chunks.push(Buffer.from(encoded));
  }

  const end = encoder.flush();
  if (end.length) chunks.push(Buffer.from(end));
  return Buffer.concat(chunks);
}

export function exportPodcastMp3FromPcm(pcm: Buffer, sampleRate: number): Buffer {
  const mastered = masterPodcastPcm(pcm);
  const mono441 = resampleMonoPcm16(mastered, sampleRate, MP3_SAMPLE_RATE);
  return encodeMp3Stereo(mono441);
}

/** Lê "audio/L16;rate=24000" e devolve o sampleRate (default 24000). */
function rateFromMime(mime?: string): number {
  const m = mime?.match(/rate=(\d+)/i);
  return m ? parseInt(m[1], 10) : 24000;
}

/**
 * Narra o texto e devolve um MP3 pronto para distribuição. Lança em erro/sem chave — o caller
 * decide o fallback. `texto` deve ser a narração limpa (use extractNarration).
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
