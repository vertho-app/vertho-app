/**
 * Geração de áudio (podcast) via Gemini TTS.
 *
 * Usado pelo "conteúdo final" de formato áudio: transforma o roteiro de podcast
 * (bloco de narração limpa) em um WAV narrado. Voz masculina de meia-idade,
 * pt-BR, acolhedora e segura — calibrada pela voz prebuilt + direção de estilo.
 *
 * Gemini TTS retorna PCM 16-bit 24kHz mono (audio/L16); embrulhamos em WAV.
 */

const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
const VOICE = process.env.GEMINI_TTS_VOICE || 'Charon'; // masculina, grave/madura
const MENTOR_VOICE = process.env.GEMINI_TTS_MENTOR_VOICE || 'Charon';
const CAMPO_VOICE = process.env.GEMINI_TTS_CAMPO_VOICE || 'Kore';

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

function brandStingPcm(sampleRate: number, variant: 'intro' | 'outro'): Buffer {
  const seconds = variant === 'intro' ? 3.2 : 2.6;
  const samples = Math.round(seconds * sampleRate);
  const pcm = Buffer.alloc(samples * 2);
  const baseGain = variant === 'intro' ? 0.52 : 0.42;
  const freqs = variant === 'intro'
    ? [293.66, 369.99, 440, 554.37, 659.25]
    : [554.37, 440, 369.99, 293.66];

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const progress = i / Math.max(1, samples - 1);
    const fadeIn = Math.min(1, progress / 0.18);
    const fadeOut = Math.min(1, (1 - progress) / 0.42);
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
    const shimmer = Math.sin(2 * Math.PI * 7 * t) * 0.03;
    const pulse = Math.sin(2 * Math.PI * 110 * t) * Math.max(0, Math.sin(2 * Math.PI * 2.2 * t)) * 0.045;
    const sweepFreq = variant === 'intro' ? 740 + (180 * progress) : 920 - (260 * progress);
    const sweep = Math.sin(2 * Math.PI * sweepFreq * t) * Math.exp(-t * 1.7) * 0.18;
    const tone = freqs.reduce((sum, freq, idx) => {
      const delay = idx * 0.16;
      const local = Math.max(0, t - delay);
      const decay = Math.exp(-local * (variant === 'intro' ? 0.7 : 1.0));
      const harmonic = Math.sin(2 * Math.PI * freq * 2 * t) * 0.28;
      return sum + (Math.sin(2 * Math.PI * freq * t) + harmonic) * decay / freqs.length;
    }, 0);
    const value = Math.max(-1, Math.min(1, (tone + sweep + shimmer + pulse) * envelope * baseGain));
    pcm.writeInt16LE(Math.round(value * 32767), i * 2);
  }

  return pcm;
}

export function addPodcastBrandSting(pcm: Buffer, sampleRate: number): Buffer {
  return Buffer.concat([
    brandStingPcm(sampleRate, 'intro'),
    silencePcm(0.25, sampleRate),
    pcm,
    silencePcm(0.2, sampleRate),
    brandStingPcm(sampleRate, 'outro'),
  ]);
}

/** Lê "audio/L16;rate=24000" e devolve o sampleRate (default 24000). */
function rateFromMime(mime?: string): number {
  const m = mime?.match(/rate=(\d+)/i);
  return m ? parseInt(m[1], 10) : 24000;
}

/**
 * Narra o texto e devolve um WAV (Buffer). Lança em erro/sem chave — o caller
 * decide o fallback. `texto` deve ser a narração limpa (use extractNarration).
 */
export async function generatePodcastAudio(texto: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  if (!texto?.trim()) throw new Error('texto de narração vazio');

  const multiSpeaker = isMultiSpeakerText(texto);
  // Direção de estilo (não é falada — orienta a entrega da voz prebuilt).
  const styled = multiSpeaker
    ? `TTS the following conversation in Brazilian Portuguese. Speaker Mentor is calm, consultative, experienced and clear. Speaker Campo is practical, direct and grounded in field reality. Keep a professional, adult tone and natural turn-taking:\n\n${texto}`
    : `Narre em português do Brasil, com voz masculina de meia-idade, tom acolhedor, seguro e íntimo, ritmo moderado e pausas reflexivas naturais:\n\n${texto}`;

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
  return pcmToWav(addPodcastBrandSting(pcm, sampleRate), sampleRate);
}
