/**
 * Cliente Veo via Gemini API (operação de longa duração).
 *
 * veo-3.1-lite-generate-preview gera 1 clipe por chamada. O fluxo é:
 *   1. POST :predictLongRunning  -> retorna { name: "operations/..." }
 *   2. GET  {operation}          -> poll até done
 *   3. baixa o MP4 da URI do resultado
 *
 * Observação: por ser modelo preview, os nomes de campos da resposta podem
 * variar. Fazemos uma busca em profundidade por uma URI/base64 de vídeo pra
 * ser resiliente a pequenas mudanças de schema.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = process.env.VEO_MODEL || 'veo-3.1-lite-generate-preview';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Procura recursivamente por uma URI de vídeo (campo .uri) ou bytes base64. */
function findVideo(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      if (/uri$/i.test(k) && /^https?:/i.test(v)) return { uri: v };
      if ((k === 'bytesBase64Encoded' || k === 'videoBytes' || k === 'data') && v.length > 1000) return { b64: v };
    } else if (v && typeof v === 'object') {
      const found = findVideo(v);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Gera um clipe Veo e devolve o MP4 como Buffer.
 * @param {string} apiKey GEMINI_API_KEY
 * @param {string} prompt veo_prompt (inglês)
 * @param {object} opts { aspectRatio, durationSeconds }
 *
 * Nota: veo-3.1-lite-generate-preview NÃO suporta `negativePrompt` (400
 * INVALID_ARGUMENT). As restrições visuais (sem texto/sem personagem falando)
 * vão embutidas no prompt positivo.
 */
export async function generateVeoClip(apiKey, prompt, opts = {}) {
  const { aspectRatio = '16:9', durationSeconds } = opts;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  if (!prompt?.trim()) throw new Error('veo prompt vazio');

  // personGeneration: 'allow_adult' dá 400 nesse preview — omitimos (usa default).
  const parameters = { aspectRatio };
  if (durationSeconds) parameters.durationSeconds = durationSeconds;
  if (process.env.VEO_RESOLUTION) parameters.resolution = process.env.VEO_RESOLUTION; // ex: "720p"

  const startRes = await fetch(`${BASE}/models/${MODEL}:predictLongRunning?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instances: [{ prompt }], parameters }),
  });
  if (!startRes.ok) throw new Error(`Veo start ${startRes.status}: ${(await startRes.text()).slice(0, 300)}`);
  const op = await startRes.json();
  const opName = op?.name;
  if (!opName) throw new Error('Veo: operação sem name');

  // Poll: Veo costuma levar 1-3 min por clipe. Teto ~8 min.
  const deadline = Date.now() + 8 * 60_000;
  let done = op.done ? op : null;
  while (!done) {
    if (Date.now() > deadline) throw new Error('Veo: timeout aguardando operação');
    await sleep(10_000);
    const pollRes = await fetch(`${BASE}/${opName}?key=${apiKey}`);
    if (!pollRes.ok) throw new Error(`Veo poll ${pollRes.status}: ${(await pollRes.text()).slice(0, 200)}`);
    const cur = await pollRes.json();
    if (cur.error) throw new Error(`Veo op error: ${JSON.stringify(cur.error).slice(0, 300)}`);
    if (cur.done) done = cur;
  }

  const vid = findVideo(done.response || done);
  if (!vid) throw new Error('Veo: resposta sem vídeo (schema inesperado)');

  if (vid.b64) return Buffer.from(vid.b64, 'base64');

  // URI do arquivo: precisa da API key pra baixar.
  const dlUrl = vid.uri.includes('key=') ? vid.uri : `${vid.uri}${vid.uri.includes('?') ? '&' : '?'}key=${apiKey}`;
  const fileRes = await fetch(dlUrl);
  if (!fileRes.ok) throw new Error(`Veo download ${fileRes.status}: ${(await fileRes.text()).slice(0, 200)}`);
  return Buffer.from(await fileRes.arrayBuffer());
}
