/**
 * Cliente Veo via Vertex AI (operação de longa duração).
 *
 * Roda dentro do Cloud Run Job e autentica com a service account do job
 * (token do metadata server) — sem API key. A cobrança cai no projeto GCP
 * (usa créditos), diferente da Gemini API key.
 *
 * Fluxo:
 *   1. POST :predictLongRunning  -> { name: "...operations/..." }
 *   2. POST :fetchPredictOperation { operationName } -> poll até done
 *   3. vídeo vem em response.videos[0].bytesBase64Encoded (sem storageUri)
 *
 * IMPORTANTE: o Veo só está disponível em algumas regiões (us-central1). O job
 * pode rodar em southamerica-east1 e chamar a Vertex em us-central1 (cross-region).
 *
 * Env:
 *   VEO_MODEL       default veo-3.1-fast-generate-001 (Vertex GA; preview exige allowlist)
 *   VEO_REGION      default us-central1 (região da Vertex p/ Veo)
 *   VEO_RESOLUTION  default 720p
 *   GCP_PROJECT_ID  opcional (senão lê do metadata server)
 */

const META = 'http://metadata.google.internal/computeMetadata/v1';
const MODEL = process.env.VEO_MODEL || 'veo-3.1-fast-generate-001';
const REGION = process.env.VEO_REGION || 'us-central1';
const IMAGEN_MODEL = process.env.IMAGEN_MODEL || 'imagen-4.0-generate-001';
const IMAGEN_CAP_MODEL = process.env.IMAGEN_CAPABILITY_MODEL || 'imagen-3.0-capability-001';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Veo só aceita durationSeconds 4 | 6 | 8 (número). Arredonda. */
function clampDuration(sec) {
  const n = Number(sec) || 6;
  const allowed = [4, 6, 8];
  return allowed.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
}

/** Access token da service account do job (metadata server). */
async function getAccessToken() {
  const res = await fetch(`${META}/instance/service-accounts/default/token`, {
    headers: { 'Metadata-Flavor': 'Google' },
  });
  if (!res.ok) throw new Error(`metadata token ${res.status}`);
  const d = await res.json();
  if (!d.access_token) throw new Error('metadata: sem access_token');
  return d.access_token;
}

/** Project ID (env ou metadata server). */
async function getProjectId() {
  if (process.env.GCP_PROJECT_ID) return process.env.GCP_PROJECT_ID;
  const res = await fetch(`${META}/project/project-id`, {
    headers: { 'Metadata-Flavor': 'Google' },
  });
  if (!res.ok) throw new Error(`metadata project-id ${res.status}`);
  return (await res.text()).trim();
}

/** Busca recursiva por bytes base64 de vídeo (fallback de schema). */
function findVideoB64(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      if ((k === 'bytesBase64Encoded' || k === 'videoBytes') && v.length > 1000) return v;
    } else if (v && typeof v === 'object') {
      const f = findVideoB64(v);
      if (f) return f;
    }
  }
  return null;
}

/**
 * Gera um retrato de referência da personagem (Imagen na Vertex), p/ ancorar a
 * identidade nos clipes Veo. Mesma auth (SA via metadata) e cobrança em créditos.
 * personGeneration:'allow_adult' permite o profissional adulto mas bloqueia menores.
 * @param {string} prompt prompt do retrato (inglês)
 * @param {object} opts { aspectRatio }
 * @returns {Promise<{bytesBase64Encoded:string, mimeType:string}>}
 */
export async function generateReferenceImage(prompt, opts = {}) {
  const { aspectRatio = '3:4' } = opts;
  if (!prompt?.trim()) throw new Error('imagen prompt vazio');

  const project = await getProjectId();
  const token = await getAccessToken();
  const url =
    `https://${REGION}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${REGION}/publishers/google/models/${IMAGEN_MODEL}:predict`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio, personGeneration: 'allow_adult' },
    }),
  });
  if (!res.ok) throw new Error(`Imagen ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const d = await res.json();
  const pred = d?.predictions?.[0];
  const b64 = pred?.bytesBase64Encoded;
  if (!b64) {
    if (pred?.raiFilteredReason) throw new Error(`Imagen RAI: ${pred.raiFilteredReason}`);
    throw new Error('Imagen: resposta sem imagem');
  }
  return { bytesBase64Encoded: b64, mimeType: pred?.mimeType || 'image/png' };
}

/**
 * Gera uma variação da MESMA pessoa (subject customization do Imagen) a partir
 * de um retrato base — usado p/ ter 2-3 ângulos da mesma identidade (frente,
 * 3/4, perfil) e dar ao Veo referências mais ricas do mesmo personagem.
 * Gerar retratos independentes daria PESSOAS diferentes; aqui o `referenceImage`
 * ancora na identidade do base. O prompt referencia o sujeito com o marcador [1].
 * @param {string} baseBytesB64 base64 do retrato base
 * @param {string} prompt prompt da variação (inglês, com "[1]")
 * @param {object} opts { subjectDescription }
 * @returns {Promise<{bytesBase64Encoded:string, mimeType:string}>}
 */
export async function generateSubjectVariation(baseBytesB64, prompt, opts = {}) {
  const { subjectDescription = 'the same adult professional, same face and wardrobe' } = opts;
  if (!baseBytesB64) throw new Error('subject base vazio');
  if (!prompt?.trim()) throw new Error('subject prompt vazio');

  const project = await getProjectId();
  const token = await getAccessToken();
  const url =
    `https://${REGION}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${REGION}/publishers/google/models/${IMAGEN_CAP_MODEL}:predict`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{
        prompt,
        referenceImages: [{
          referenceType: 'REFERENCE_TYPE_SUBJECT',
          referenceId: 1,
          referenceImage: { bytesBase64Encoded: baseBytesB64 },
          subjectImageConfig: { subjectType: 'SUBJECT_TYPE_PERSON', subjectDescription },
        }],
      }],
      parameters: { sampleCount: 1 },
    }),
  });
  if (!res.ok) throw new Error(`Imagen subject ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const d = await res.json();
  const pred = d?.predictions?.[0];
  const b64 = pred?.bytesBase64Encoded;
  if (!b64) throw new Error('Imagen subject: resposta sem imagem');
  return { bytesBase64Encoded: b64, mimeType: pred?.mimeType || 'image/png' };
}

/**
 * Gera um clipe Veo (Vertex) e devolve o MP4 como Buffer.
 * @param {string} prompt veo_prompt (inglês)
 * @param {object} opts { aspectRatio, durationSeconds, referenceImages }
 *   referenceImages: array de { bytesBase64Encoded, mimeType } — subject refs
 *   (até 3) p/ manter a MESMA personagem entre os clipes.
 */
export async function generateVeoClip(prompt, opts = {}) {
  const { aspectRatio = '16:9', durationSeconds, referenceImages } = opts;
  if (!prompt?.trim()) throw new Error('veo prompt vazio');

  const project = await getProjectId();
  const token = await getAccessToken();
  const base =
    `https://${REGION}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${REGION}/publishers/google/models/${MODEL}`;
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Subject references (até 3) ancoram a MESMA personagem entre clipes —
  // o Veo não tem memória, então só texto não garante o mesmo rosto.
  const hasRefs = Array.isArray(referenceImages) && referenceImages.length > 0;

  // Sem storageUri => vídeo volta em base64 na resposta.
  // generateAudio:false — os clipes Veo são b-roll mudo (o FFmpeg descarta o
  // áudio com -an); gerar áudio só encareceria o clipe (~US$0,15/s vs 0,10/s).
  // reference_to_video só aceita durationSeconds=8 (força 8 quando há refs).
  const parameters = {
    aspectRatio,
    sampleCount: 1,
    durationSeconds: hasRefs ? 8 : clampDuration(durationSeconds),
    resolution: process.env.VEO_RESOLUTION || '720p',
    generateAudio: false,
  };

  const instance = { prompt };
  if (hasRefs) {
    instance.referenceImages = referenceImages.slice(0, 3).map((r) => ({
      image: { bytesBase64Encoded: r.bytesBase64Encoded, mimeType: r.mimeType || 'image/png' },
      referenceType: 'asset',
    }));
  }

  const startRes = await fetch(`${base}:predictLongRunning`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ instances: [instance], parameters }),
  });
  if (!startRes.ok) throw new Error(`Veo start ${startRes.status}: ${(await startRes.text()).slice(0, 300)}`);
  const op = await startRes.json();
  const opName = op?.name;
  if (!opName) throw new Error('Veo: operação sem name');

  // Poll via fetchPredictOperation. Veo leva 1-3 min/clipe; teto ~8 min.
  const deadline = Date.now() + 8 * 60_000;
  let done = op.done ? op : null;
  while (!done) {
    if (Date.now() > deadline) throw new Error('Veo: timeout aguardando operação');
    await sleep(10_000);
    const pollRes = await fetch(`${base}:fetchPredictOperation`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ operationName: opName }),
    });
    if (!pollRes.ok) throw new Error(`Veo poll ${pollRes.status}: ${(await pollRes.text()).slice(0, 200)}`);
    const cur = await pollRes.json();
    if (cur.error) throw new Error(`Veo op error: ${JSON.stringify(cur.error).slice(0, 300)}`);
    if (cur.done) done = cur;
  }

  const resp = done.response || done;
  if (resp?.raiMediaFilteredCount > 0) {
    console.error('[veo] filtrado (RAI):', JSON.stringify(resp.raiMediaFilteredReasons || resp).slice(0, 600));
    throw new Error('Veo: clipe bloqueado por filtro de conteúdo (RAI)');
  }

  const video = resp?.videos?.[0];
  const b64 = video?.bytesBase64Encoded || findVideoB64(resp);
  if (b64) return Buffer.from(b64, 'base64');

  // Fallback: se vier gcsUri (caso storageUri tenha sido setado), baixa do GCS.
  const gcsUri = video?.gcsUri;
  if (gcsUri?.startsWith('gs://')) {
    const [, bucket, ...rest] = gcsUri.replace('gs://', '').match(/^([^/]+)\/(.+)$/) || [];
    const obj = encodeURIComponent(rest.join('/'));
    const dl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${obj}?alt=media`;
    const fileRes = await fetch(dl, { headers: { Authorization: `Bearer ${token}` } });
    if (!fileRes.ok) throw new Error(`Veo GCS download ${fileRes.status}`);
    return Buffer.from(await fileRes.arrayBuffer());
  }

  console.error('[veo] resposta sem vídeo:', JSON.stringify(resp).slice(0, 1500));
  throw new Error('Veo: resposta sem vídeo (schema inesperado)');
}
