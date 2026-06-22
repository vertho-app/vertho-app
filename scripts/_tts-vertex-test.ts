/**
 * PROVA DE VOZ — TTS via Vertex (ou AI Studio). Gera um mp3 curto e salva.
 *
 * Pré-requisitos no .env.local (para Vertex):
 *   TTS_BACKEND=vertex
 *   GOOGLE_SERVICE_ACCOUNT_JSON=<json da SA cru OU base64>   (papel: Vertex AI User)
 *   GOOGLE_VERTEX_LOCATION=us-central1          (ou 'global')
 *   GEMINI_TTS_VERTEX_MODEL=<id do modelo no Vertex>   (ex.: gemini-2.5-flash-tts;
 *       se der 404, ajuste aqui — é o passo de descoberta do ID correto)
 *   GEMINI_TTS_VOICE=Vindemiatrix               (voz da narração de vídeo)
 *
 * Rodar:  npx tsx scripts/_tts-vertex-test.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { generateNarrationAudio } from '../lib/gemini-tts';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('='); if (i < 0) continue;
  const k = line.slice(0, i).trim(); if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
}

const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  log('backend:', process.env.TTS_BACKEND || 'aistudio',
    '· location:', process.env.GOOGLE_VERTEX_LOCATION || 'us-central1',
    '· model:', process.env.GEMINI_TTS_VERTEX_MODEL || process.env.GEMINI_TTS_MODEL || '(default)',
    '· voice:', process.env.GEMINI_TTS_VOICE || 'Charon');

  const texto = 'Olá. Esta é uma prova de voz da Vertho pela esteira nova. A resposta vem com clareza? Quase sempre — quando o foco está no próximo passo.';
  const t0 = Date.now();
  const audio = await generateNarrationAudio(texto, { voice: process.env.GEMINI_TTS_VOICE });
  const out = 'tts-vertex-prova.mp3';
  writeFileSync(out, audio.buffer);
  log(`OK em ${((Date.now() - t0) / 1000).toFixed(1)}s → ${out} (${(audio.buffer.length / 1024).toFixed(0)} KB)`);
  log('Note a PAUSA dramática após "...com clareza?" (silêncio determinístico injetado).');
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
