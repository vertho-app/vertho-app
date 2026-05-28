/**
 * Voice-over via Gemini TTS (mesma config do podcast do app): voz Charon,
 * masculina de meia-idade, pt-BR. Retorna WAV (PCM 24kHz embrulhado).
 */

const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
const VOICE = process.env.GEMINI_TTS_VOICE || 'Charon';

function pcmToWav(pcm, sampleRate = 24000, channels = 1, bits = 16) {
  const blockAlign = (channels * bits) / 8;
  const byteRate = sampleRate * blockAlign;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function rateFromMime(mime) {
  const m = mime?.match(/rate=(\d+)/i);
  return m ? parseInt(m[1], 10) : 24000;
}

/**
 * Gera o voice-over. `stylePrompt` orienta a entrega; `script` é a narração.
 * @returns {Promise<Buffer>} WAV
 */
export async function generateVoiceOver(apiKey, script, stylePrompt) {
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  if (!script?.trim()) throw new Error('voiceover_script vazio');

  const direction = stylePrompt
    || 'Narre em português do Brasil, voz masculina de meia-idade, tom adulto, calmo, seguro e consultivo, ritmo moderado, como um mentor experiente. Sem teatralidade.';
  const styled = `${direction}:\n\n${script}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: styled }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) throw new Error('Gemini TTS: resposta sem áudio');
  return pcmToWav(Buffer.from(b64, 'base64'), rateFromMime(part.inlineData.mimeType));
}
