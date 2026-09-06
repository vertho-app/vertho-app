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
import { mapComTeto } from '@/lib/concorrencia';
import { fadePcm16, silencePcm, wavToMonoPcm16AtRate, exportPodcastMp3FromPcm } from './tts/audio-dsp';
import {
  buildPersonalizedPodcastNarration,
  extractNarration,
  ensurePodcastBrandNarration,
  isMultiSpeakerText,
  splitNarrationForTts,
} from './tts/narration-text';
import { getGoogleAccessToken, vertexProjectId } from './tts/google-token';
import { medirDeriva, avaliarDeriva, resumirDeriva, ALVO_F0_POR_VOZ, type MetricasDeriva, type AlvoVoz } from './tts/deriva';
import { ASSINATURAS_VOZ } from './tts/assinaturas-voz';
import { ELENCO } from './tts/elenco';
import { gravarVereditosTts } from './tts/qa-log';
import { costFromTokens } from './ia-cost-catalog';
import { gravarLinhaLedger } from './ia-ledger';
import { contextoAtual } from './execucao-contexto';

// Re-export da API pública (callers continuam importando de '@/lib/gemini-tts').
export { buildPersonalizedPodcastNarration, extractNarration, ensurePodcastBrandNarration } from './tts/narration-text';
export { exportPodcastMp3FromPcm } from './tts/audio-dsp';

// MODELO: `gemini-2.5-flash-tts` (GA) desde 05/09/2026. O `gemini-3.1-flash-tts-preview`
// que rodou de junho a setembro DERIVA dentro de uma chamada longa: `Medido:` em 21
// podcasts de produção e 12 arquivos de bake-off, o volume caía 1,5 a 3,4 dB/min, o
// timbre andava 0,42-0,82σ (leitor humano: 0,24σ) e a fala acelerava; prompt reforçado
// e temperature 0,3 não mudaram nada (0/6). Os modelos GA da família 2.5 passaram
// 34/36 na mesma régua, e o Flash custa metade (US$ 0,045/episódio). Ver
// PLANO-DERIVA-PODCAST-2026-09-04.md §6. O id do AI Studio é o `-preview-tts`.
const MODEL = process.env.GEMINI_TTS_MODEL || ELENCO.mentora.modeloAiStudio;
// ELENCO desde 05/09/2026 (escolhido às cegas pelo Rodrigo e medido em 41 sínteses):
// a mentora = Aoede (208 Hz; entre takes varia 0,4-1,0 st, inaudível), o BETO =
// Iapetus (144 Hz; 1,2-2,3 st entre takes — por isso o portão de F0 abaixo).
// ⚠️ Trocar de MODELO troca a VOZ mesmo com o mesmo nome: a Vindemiatrix do 2.5 fica a
// 0,45σ e +2,6 st da Vindemiatrix do 3.1 (duas pessoas distintas ficam a 0,40σ).
// Defaults vêm do ELENCO (lib/tts/elenco.ts): personagem = voz + modelo + alvo, junto.
const VOICE = process.env.GEMINI_TTS_VOICE || ELENCO.mentora.voz;              // narração single-speaker (vídeo/podcast)
const MENTOR_VOICE = process.env.GEMINI_TTS_MENTOR_VOICE || ELENCO.beto.voz;   // speaker "Mentor" = Beto
const CAMPO_VOICE = process.env.GEMINI_TTS_CAMPO_VOICE || ELENCO.mentora.voz;  // speaker "Campo"
const brandStingCache = new Map<string, Buffer>();

// ── BACKEND: AI Studio (API key) × Vertex AI (OAuth de service account) ───────
// Vertex tem cota MUITO maior (resolve o teto de TPM do AI Studio) — é o caminho
// de escala. Opt-in por env (default 'aistudio' p/ não quebrar prod). No Vertex,
// o modelo pode ter ID diferente (GEMINI_TTS_VERTEX_MODEL) e o endpoint é regional
// (ou 'global' → host sem prefixo de região).
const TTS_BACKEND = (process.env.TTS_BACKEND || 'aistudio').toLowerCase();
const VERTEX_LOCATION = process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
// No Vertex o id GA não tem sufixo. `Medido 05/09/2026`: `gemini-3.5-*-tts` e
// `gemini-3.1-pro-*-tts` respondem 404 — não existem; 2.5 Flash/Pro TTS existem e geram.
const VERTEX_MODEL = process.env.GEMINI_TTS_VERTEX_MODEL || ELENCO.mentora.modeloVertex;

/** Endpoint + headers do TTS conforme o backend. */
async function ttsEndpoint(): Promise<{ url: string; headers: Record<string, string> }> {
  if (TTS_BACKEND === 'vertex') {
    const token = await getGoogleAccessToken();
    const proj = vertexProjectId();
    const host = VERTEX_LOCATION === 'global' ? 'aiplatform.googleapis.com' : `${VERTEX_LOCATION}-aiplatform.googleapis.com`;
    const url = `https://${host}/v1/projects/${proj}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:generateContent`;
    return { url, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    headers: { 'Content-Type': 'application/json' },
  };
}

/** Veredito do portão de qualidade (ver `sintetizarComPortao`). */
export interface QaDeriva {
  metricas: MetricasDeriva;
  ok: boolean;
  motivos: string[];
  tentativas: number;
}

export type PodcastAudioFile = {
  buffer: Buffer;
  contentType: 'audio/mpeg';
  extension: 'mp3';
  /** Ausente em multi-speaker (F0 e timbre alternam por construção) e com TTS_QA_GATE=off. */
  qa?: QaDeriva;
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
 * Timeout de uma chamada LONGA, pelo tamanho do texto. `Medido 05/09/2026` no
 * `gemini-2.5-flash-tts` (bake-off, n=6): 0,40 s de latência por segundo de áudio na
 * mediana, 0,52 no pior caso; ~12 caracteres por segundo de áudio. 0,8 s/s cobre
 * 1,5× o pior caso + 30 s de folga; teto de 280 s porque a rota sob demanda tem
 * 300 s e ainda precisa medir e subir o arquivo. Timeout abaixo do pior caso real
 * transforma síntese lenta em falha cara — foi o que 170 s fixos fariam em 5 min.
 */
function timeoutAdaptativo(chars: number): number {
  const audioS = chars / 12;
  return Math.min(280_000, Math.max(120_000, 30_000 + Math.round(800 * audioS)));
}

/**
 * Etiqueta da síntese no ledger de IA. Declarada pelo call-site, como o
 * `taskKey` do `callAI` — quem chama sabe se aquilo é narração de vídeo,
 * devolutiva ou podcast, e `ttsGenerate` não tem como descobrir.
 */
export interface TtsLedger {
  correlationId?: string;
  feature: string;
  empresaId?: string | null;
  colaboradorId?: string | null;
}

/** Modelo efetivamente pedido (o endpoint do Vertex aceita id próprio). */
function modeloEfetivo(): string {
  return TTS_BACKEND === 'vertex' ? VERTEX_MODEL : MODEL;
}

/**
 * Registra a chamada no ledger de IA (`ia_usage_log`).
 *
 * Por que aqui e não nos call-sites: cobertura por construção, mesma decisão do
 * `registrarUsoIA` em `actions/ai-client.ts`. Toda síntese passa por
 * `ttsGenerate`, então nenhuma geração nova pode nascer sem custo registrado.
 *
 * `source` carrega o BACKEND (`tts:vertex` / `tts:aistudio`). Isso não é enfeite:
 * `TTS_BACKEND` está marcada como *Sensitive* na Vercel, o que a torna ilegível
 * por `env ls` e por `env pull` (volta `[SENSITIVE]`) — a única forma de saber
 * qual backend produção usa de fato é o próprio comportamento em runtime.
 *
 * Grava também a resposta 200 SEM áudio: ela é cobrada no input e hoje some do
 * custo, apesar de ser exatamente o caso que já custou um diagnóstico por chute
 * (ver o bloco de `finishReason` abaixo).
 */
async function registrarUsoTts(
  ledger: TtsLedger,
  data: any,
  latencyMs: number,
  status: 'ok' | string,
) {
  const usage = data?.usageMetadata;
  if (!usage) return;
  const inTokens = Number(usage.promptTokenCount) || 0;
  const outTokens = Number(usage.candidatesTokenCount) || 0;
  const model = modeloEfetivo();
  const ctx = contextoAtual();
  await gravarLinhaLedger({
    feature: ledger.feature,
    ...(ledger.correlationId ? { correlation_id: ledger.correlationId } : {}),
    empresa_id: ledger.empresaId ?? null,
    colaborador_id: ledger.colaboradorId ?? null,
    provider: 'gemini',
    model,
    input_tokens: inTokens,
    output_tokens: outTokens,
    cost_usd: costFromTokens(model, { inTokens, outTokens }),
    latency_ms: latencyMs,
    status,
    source: `tts:${TTS_BACKEND}`,
    runtime: ctx.runtime,
    orcamento_ms: ctx.orcamentoMs ?? null,
  });
}

/**
 * Chamada crua ao TTS (AI Studio OU Vertex, conforme TTS_BACKEND): body → PCM
 * 16-bit mono. RETRY com backoff exponencial em 429 (rate-limit) e 503; respeita
 * `Retry-After`. O body (contents/generationConfig/speechConfig) é idêntico nos
 * dois backends — só o endpoint/auth muda (ttsEndpoint).
 */
async function ttsGenerate(body: unknown, ledger: TtsLedger, attempt = 0, timeoutMs = 170_000): Promise<{ pcm: Buffer; sampleRate: number }> {
  const { url, headers } = await ttsEndpoint();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      // Timeout: retentar SEM backoff extra (a espera já foi o próprio timeout) e
      // com orçamento MENOR que o do 429/503 — timeout repetido indica problema
      // não-transitório. Em chamada LONGA (timeout ≥ 150 s, narração inteira) NÃO
      // retenta: a 2ª tentativa começaria já fora do orçamento da função (300 s).
      if (timeoutMs < 150_000 && attempt < Math.min(2, TTS_MAX_RETRIES)) {
        console.warn(`TTS timeout ${Math.round(timeoutMs / 1000)}s (${TTS_BACKEND}) — retry imediato (tentativa ${attempt + 1}/2)`);
        return ttsGenerate(body, ledger, attempt + 1, timeoutMs);
      }
      throw new Error(`Gemini TTS: timeout (${Math.round(timeoutMs / 1000)}s) após ${attempt + 1} tentativas`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  // 499 CANCELLED, 500, 502 e 504 são transitórios do lado do Vertex (o 499 chegou como
  // JSON do servidor em 06/09, numa de 9 chamadas paralelas, e derrubou o vídeo inteiro).
  const transitorio = res.status === 429 || res.status === 503 || res.status === 499 || res.status === 500 || res.status === 502 || res.status === 504;
  if (transitorio && attempt < TTS_MAX_RETRIES) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const backoff = Math.min(30_000, 2_000 * 2 ** attempt); // 2s, 4s, 8s, 16s
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff;
    console.warn(`TTS ${res.status} (${TTS_BACKEND}) — retry em ${Math.round(wait / 1000)}s (tentativa ${attempt + 1}/${TTS_MAX_RETRIES})`);
    await new Promise((r) => setTimeout(r, wait));
    return ttsGenerate(body, ledger, attempt + 1, timeoutMs);
  }
  if (!res.ok) throw new Error(`TTS ${res.status} (${TTS_BACKEND}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) {
    // 200 OK SEM áudio. Acontece por dois motivos que a mensagem precisa
    // DISTINGUIR, porque pedem ações opostas:
    //   · transitório (candidato vazio no Vertex) → retry resolve;
    //   · recusa do modelo (`finishReason` SAFETY/RECITATION/…) → retry NUNCA
    //     resolve, é o texto que precisa mudar.
    //
    // 🔴 O motivo estava sendo DESCARTADO (17/08/2026). Ele era lido para o
    // `console.warn` do worker — que é uma box efêmera, some com ela — e a
    // exceção subia genérica: "resposta sem áudio após N tentativas". Foi o que
    // chegou ao banco em 4 falhas da mesma célula (`72b704c6 × I`) enquanto
    // C, D e S do mesmo módulo passavam. Com a causa invisível, o diagnóstico
    // virou chute: atribuí a saturação de fornecedor, reescrevi a narração
    // suspeita — e falhou de novo, porque eu estava adivinhando.
    //
    // ⚠️ O comentário anterior afirmava "não determinístico pelo texto". A
    // evidência do dia diz o contrário para ESTE caso: 4 de 4 tentativas, em
    // horários e cargas diferentes, inclusive com a fila vazia.
    const finish = data?.candidates?.[0]?.finishReason
      || data?.promptFeedback?.blockReason
      || 'sem-inlineData';
    // Resposta sem áudio TAMBÉM é paga (o input foi processado) e some do custo
    // se só o caminho feliz gravar. É justamente o caso que precisa aparecer:
    // 4 tentativas da mesma célula custaram um diagnóstico por chute em 17/08.
    await registrarUsoTts(ledger, data, Date.now() - t0, `sem-audio:${finish}`);
    if (attempt < TTS_MAX_RETRIES) {
      const backoff = Math.min(30_000, 2_000 * 2 ** attempt);
      console.warn(`TTS resposta sem áudio (${finish}, ${TTS_BACKEND}) — retry em ${Math.round(backoff / 1000)}s (tentativa ${attempt + 1}/${TTS_MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, backoff));
      return ttsGenerate(body, ledger, attempt + 1, timeoutMs);
    }
    throw new Error(`TTS: resposta sem áudio após ${TTS_MAX_RETRIES} tentativas (motivo: ${finish})`);
  }
  await registrarUsoTts(ledger, data, Date.now() - t0, 'ok');
  return { pcm: Buffer.from(b64, 'base64'), sampleRate: rateFromMime(part.inlineData.mimeType) };
}

/** Single-speaker: texto+direção de estilo → PCM. */
function ttsToPcm(prompt: string, voiceName: string, ledger: TtsLedger, timeoutMs?: number): Promise<{ pcm: Buffer; sampleRate: number }> {
  return ttsGenerate({
    // role:'user' é OBRIGATÓRIO no Vertex (o AI Studio aceita também → compatível).
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  }, ledger, 0, timeoutMs);
}

// ── PORTÃO DE QUALIDADE ───────────────────────────────────────────────────────
//
// Toda síntese longa single-speaker passa pela régua de deriva (`lib/tts/deriva.ts`)
// ANTES de virar MP3. Reprovou → sintetiza de novo (a deriva é estocástica) e
// publica a melhor das tentativas. `Medido 05/09/2026` nas vozes adotadas: a faixa de
// ±1 st em torno do alvo de F0 gera ~7% de retake em Aoede e ~21% em Iapetus, a
// US$ 0,02-0,05 cada — é o preço de a pessoa A e a pessoa B ouvirem a mesma voz.
//
// Fail-OPEN declarado: se nenhuma tentativa passar, publica a menos ruim e avisa no
// log. Bloquear a entrega por causa de 1 semitom seria trocar um defeito audível
// por um "podcast ainda não gerado" — pior para quem está esperando.
const QA_GATE_ATIVO = (process.env.TTS_QA_GATE || 'on').toLowerCase() !== 'off';
const QA_MAX_TENTATIVAS = Math.max(1, Number(process.env.TTS_QA_TENTATIVAS) || 2);

/** Como o portão refaz: em SÉRIE (fundo: pré-aquecimento, `after()`, lote) ou em
 *  PARALELO (sob demanda: a pessoa está esperando e a rota tem 300 s). */
export interface OpcoesPortao {
  /** `true` = as K tentativas saem juntas e a primeira que passa é publicada. Custa K×
   *  (US$ 0,045 → 0,09 por episódio; irrelevante neste volume) e vale 1 tentativa de
   *  latência: em série, 2 × (100-150 s) não cabe nos 300 s da rota sob demanda. */
  retakeParalelo?: boolean;
  /** Teto de tentativas desta chamada (default `TTS_QA_TENTATIVAS`). O canário passa 1:
   *  ele quer medir o take como sai, não o melhor de K. */
  tentativas?: number;
}

type Sintese = { pcm: Buffer; sampleRate: number };

function julgar(r: Sintese, alvo: AlvoVoz | null, voz: string, rotulo: string, tentativa: number, total: number): Sintese & { qa: QaDeriva } {
  const t0 = Date.now();
  // A assinatura de referência da voz (quando existe) entra como MÉTRICA — distância
  // de identidade da locutora — e ainda não como veto: fase 4, calibrar com uma
  // semana de `tts_qa_log` antes de bloquear.
  const metricas = medirDeriva(r.pcm, r.sampleRate, ASSINATURAS_VOZ[voz] || null);
  const { ok, motivos } = avaliarDeriva(metricas, alvo);
  const qa: QaDeriva = { metricas, ok, motivos, tentativas: tentativa };
  console[ok ? 'log' : 'warn'](`[tts-qa] ${rotulo} · ${voz} · tentativa ${tentativa}/${total}: ${ok ? 'ok' : `REPROVA (${motivos.join('; ')})`} · ${resumirDeriva(metricas)}${metricas.timbreVsRefSigma !== undefined ? ` · vs ref ${metricas.timbreVsRefSigma.toFixed(2)}σ` : ''} · régua ${Date.now() - t0}ms`);
  return { ...r, qa };
}

/** Persiste UMA linha por tentativa (`tts_qa_log`), marcando a publicada. Fire-and-forget
 *  com `await`: gravar leva ~50 ms e nunca lança (ver lib/tts/qa-log.ts). */
/** Modelo efetivamente usado pelo backend ativo — entra na assinatura do take único. */
export function modeloTtsEfetivo(): string {
  return modeloEfetivo();
}

async function persistirVereditos(julgadas: (Sintese & { qa: QaDeriva })[], publicada: (Sintese & { qa: QaDeriva }) | null, voz: string, rotulo: string, total: number, ledger?: TtsLedger) {
  await gravarVereditosTts(julgadas.map((j) => ({
    origem: rotulo === 'canario_tts' ? 'canario' : 'portao',
    feature: ledger?.feature ?? rotulo,
    voz,
    modelo: modeloEfetivo(),
    rotulo,
    tentativa: j.qa.tentativas,
    totalTentativas: total,
    ok: j.qa.ok,
    publicado: j === publicada,
    motivos: j.qa.motivos,
    metricas: j.qa.metricas,
    empresaId: ledger?.empresaId ?? null,
    correlationId: ledger?.correlationId ?? null,
  })));
}

async function sintetizarComPortao(
  sintetizar: () => Promise<Sintese>,
  voz: string,
  rotulo: string,
  opts: OpcoesPortao = {},
  ledger?: TtsLedger,
): Promise<Sintese & { qa?: QaDeriva }> {
  if (!QA_GATE_ATIVO) return sintetizar();
  const alvo = ALVO_F0_POR_VOZ[voz] || null;
  const total = Math.max(1, opts.tentativas ?? QA_MAX_TENTATIVAS);
  // "Menos ruim" nunca é um take SEM FALA: silêncio ou ruído reprovam com um motivo só e
  // ganhariam de um take com voz e dois motivos. Sem nenhuma tentativa com fala, não há
  // o que publicar — falha alto (a chamada já re-tentou "resposta sem áudio" antes).
  const semFala = (j: Sintese & { qa: QaDeriva }) => j.qa.motivos.some((m) => m.startsWith('sem fala'));
  const menosRuim = (xs: (Sintese & { qa: QaDeriva })[]) => {
    const comFala = xs.filter((j) => !semFala(j));
    if (!comFala.length) throw new Error(`TTS: nenhuma das ${xs.length} tentativa(s) tem fala (${xs[0]?.qa.motivos.join('; ')})`);
    return comFala.reduce((a, b) => (b.qa.motivos.length < a.qa.motivos.length ? b : a));
  };

  if (opts.retakeParalelo && total > 1) {
    // Todas as tentativas juntas; a PRIMEIRA (por índice, não por chegada) que passa
    // é publicada — a escolha é determinística e não "a mais mediana".
    const rs = await Promise.all(Array.from({ length: total }, () => sintetizar()));
    const julgadas = rs.map((r, i) => julgar(r, alvo, voz, rotulo, i + 1, total));
    const aprovada = julgadas.find((j) => j.qa.ok);
    let escolhida: (Sintese & { qa: QaDeriva }) | null = aprovada ?? null;
    try {
      escolhida = aprovada ?? menosRuim(julgadas);
    } finally {
      await persistirVereditos(julgadas, escolhida, voz, rotulo, total, ledger);
    }
    if (!aprovada) console.warn(`[tts-qa] ${rotulo} · ${voz}: nenhuma das ${total} tentativas paralelas passou — publicando a menos ruim (${escolhida.qa.motivos.join('; ')})`);
    return escolhida;
  }

  const julgadas: (Sintese & { qa: QaDeriva })[] = [];
  for (let tentativa = 1; tentativa <= total; tentativa++) {
    const j = julgar(await sintetizar(), alvo, voz, rotulo, tentativa, total);
    julgadas.push(j);
    if (j.qa.ok) { await persistirVereditos(julgadas, j, voz, rotulo, total, ledger); return j; }
  }
  let m: (Sintese & { qa: QaDeriva }) | null = null;
  try {
    m = menosRuim(julgadas);
  } finally {
    await persistirVereditos(julgadas, m, voz, rotulo, total, ledger);
  }
  console.warn(`[tts-qa] ${rotulo} · ${voz}: nenhuma tentativa passou — publicando a menos ruim (${m.qa.motivos.join('; ')})`);
  return m;
}

// Direção de estilo default (devolutiva comportamental): mensagem pessoal do
// mentor, ritmo moderado/reflexivo. O caminho de VÍDEO passa `opts.style` com um
// ritmo mais ágil (ver trigger/gerar-video-modulo.ts).
const NARRATION_STYLE_DEFAULT = 'Narre em português do Brasil, com voz feminina acolhedora, segura e íntima, ritmo moderado e pausas reflexivas naturais, como uma mentora falando diretamente com a pessoa';

// PAUSA DRAMÁTICA determinística após perguntas retóricas. O Gemini TTS NÃO
// suporta SSML <break>; em vez de depender do modelo, injetamos silêncio EXATO
// entre os segmentos. Não polui legendas (estas vêm do texto da narração, não do
// áudio) e o Whisper realinha o timing naturalmente.
const QUESTION_PAUSE_SEC = Number(process.env.GEMINI_TTS_QUESTION_PAUSE) || 0.7;
const SEGMENT_PAUSE_SEC = 0.22; // respiro normal entre trechos/segmentos

/** Quebra um trecho após cada pergunta retórica seguida de mais texto (mantém o
 *  "?" no segmento da esquerda). Marca q=true quando o segmento termina em "?". */
function segmentarPorPausa(trecho: string): { text: string; q: boolean }[] {
  const parts: { text: string; q: boolean }[] = [];
  const re = /([^?]*\?)\s+(?=\S)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trecho)) !== null) {
    const text = trecho.slice(last, m.index + m[1].length).trim();
    if (text) parts.push({ text, q: true });
    last = re.lastIndex;
  }
  const rest = trecho.slice(last).trim();
  if (rest) parts.push({ text: rest, q: /\?$/.test(rest) });
  return parts.length ? parts : [{ text: trecho.trim(), q: /\?$/.test(trecho.trim()) }];
}

// Mínimo de palavras por segmento de TTS. Fragmentos muito curtos (ex.: cauda de
// 1-2 palavras após "?") fazem o Gemini TTS ALUCINAR/vocalizar sobras (palavras
// "fantasmas" no fim, sem legenda — não estão no roteiro). Coalescemos curtos no
// vizinho, preservando a pausa dramática entre os trechos substanciais.
const MIN_SEG_WORDS = 4;
const nWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

function coalesceCurtos(parts: { text: string; q: boolean }[]): { text: string; q: boolean }[] {
  const out: { text: string; q: boolean }[] = [];
  for (const p of parts) {
    if (out.length && nWords(p.text) < MIN_SEG_WORDS) {
      const prev = out[out.length - 1];
      prev.text = `${prev.text} ${p.text}`.trim();
      prev.q = /\?$/.test(prev.text); // o "?" só conta se ficou no FIM do segmento juntado
    } else {
      out.push({ ...p });
    }
  }
  // Se o PRIMEIRO segmento ficou curto, junta pra frente (não há "anterior").
  if (out.length > 1 && nWords(out[0].text) < MIN_SEG_WORDS) {
    out[1].text = `${out[0].text} ${out[1].text}`.trim();
    out.shift();
  }
  return out;
}

/**
 * Narração LIMPA (sem vinheta nem frase de encerramento de podcast). Para usos
 * como a devolutiva comportamental e a narração de vídeo. `texto` deve ser a
 * narração limpa. Narra em TRECHOS (mesma voz) e concatena o PCM com uma pausa
 * curta entre eles — mantém voz e volume consistentes do início ao fim.
 */
export async function generateNarrationAudio(
  texto: string,
  opts: { voice?: string; style?: string; ledger?: TtsLedger; segmentar?: boolean } & OpcoesPortao = {},
): Promise<PodcastAudioFile> {
  if (!texto?.trim()) throw new Error('texto de narração vazio');
  const voice = opts.voice || VOICE;
  const styleDirective = opts.style || NARRATION_STYLE_DEFAULT;
  const ledger = opts.ledger || { feature: 'tts_narracao' };

  // CHAMADA ÚNICA (`segmentar: false`) — o caminho da DEVOLUTIVA desde 05/09/2026.
  //
  // O fatiamento abaixo nasceu em 11/06 para fugir da deriva do modelo antigo, e
  // trocou deriva por COSTURA: cada fatia é um sorteio novo de registro. `Medido
  // 05/09/2026` em 8 fatias do mesmo texto: o 3.1/Achird variava 5,2 st entre
  // fatias; o 2.5/Iapetus 2,8-3,7 st; um leitor humano, 2,3 st. O mesmo texto em
  // chamada única no 2.5: 1,7-3,3 st — e o modelo GA não deriva em 5 minutos, então
  // a razão de fatiar deixou de existir. Custo: ~100-150 s de latência para 4-5 min
  // de áudio (as fatias em paralelo levavam ~60 s); ainda abaixo dos 246 s do laço
  // em série que motivou a paralelização de 01/09. Timeout pelo tamanho do texto
  // (`timeoutAdaptativo`) e SEM retry de timeout: repetir uma chamada de 4 min
  // estouraria o orçamento da função.
  if (opts.segmentar === false) {
    const timeoutMs = timeoutAdaptativo(texto.length);
    const r = await sintetizarComPortao(
      () => ttsToPcm(`${styleDirective}:\n\n${texto}`, voice, ledger, timeoutMs),
      voice,
      ledger.feature,
      { retakeParalelo: opts.retakeParalelo, tentativas: opts.tentativas },
      ledger,
    );
    return {
      buffer: exportPodcastMp3FromPcm(r.pcm, r.sampleRate),
      contentType: 'audio/mpeg',
      extension: 'mp3',
      ...(r.qa ? { qa: r.qa } : {}),
    };
  }
  // Trechos do chunker → segmentos por pausa (corta após perguntas retóricas) →
  // coalesce de fragmentos curtos (evita "palavras fantasmas" do TTS no fim).
  const segmentos = coalesceCurtos(splitNarrationForTts(texto).flatMap(segmentarPorPausa));

  // 🔴 OS SEGMENTOS VÃO EM PARALELO, COM TETO.
  //
  // `Medido 01/09/2026:` uma devolutiva são 8 a 12 segmentos, e o laço em série
  // somava 246,8s e 411,3s de latência — 231s e 267s de ponta a ponta. Não era
  // "o TTS está lento" (23s por chamada é o normal dele): era uma FILA de 8 a 12
  // chamadas de 23s. Quem esperava, esperava QUATRO MINUTOS.
  //
  // O teto existe porque o gargalo do Vertex é TPM: sem ele, uma devolutiva de
  // 12 segmentos vira 12 chamadas simultâneas, e duas pessoas ao mesmo tempo
  // derrubam as duas com 429.
  //
  // A ORDEM é preservada por ÍNDICE, nunca por ordem de chegada: áudio remontado
  // fora de ordem é uma devolutiva com as frases embaralhadas — defeito que um
  // teste de "gerou?" não pega.
  const CONCORRENCIA_TTS = 4;
  const pcms = await mapComTeto(segmentos, CONCORRENCIA_TTS, (seg) => (
    ttsToPcm(`${styleDirective}:\n\n${seg.text}`, voice, ledger)
  ));

  const partes: Buffer[] = [];
  let sampleRate = pcms[0]?.sampleRate || 24000;
  for (let i = 0; i < segmentos.length; i++) {
    sampleRate = pcms[i].sampleRate;
    if (partes.length) {
      // Silêncio EXATO: longo após pergunta retórica (pausa dramática), normal senão.
      partes.push(silencePcm(segmentos[i - 1].q ? QUESTION_PAUSE_SEC : SEGMENT_PAUSE_SEC, sampleRate));
    }
    partes.push(pcms[i].pcm);
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
export async function generatePodcastAudio(texto: string, ledger?: TtsLedger, opts: OpcoesPortao = {}): Promise<PodcastAudioFile> {
  if (!texto?.trim()) throw new Error('texto de narração vazio');

  const textoComMarca = ensurePodcastBrandNarration(texto);
  const multiSpeaker = isMultiSpeakerText(textoComMarca);
  // Direção de estilo (não é falada — orienta a entrega da voz prebuilt).
  const styled = multiSpeaker
    // O gênero vai EXPLÍCITO na direção: o prompt de estilo dirige a prosódia e,
    // sem ele, a entrega não acompanha a troca da voz prebuilt.
    ? `TTS the following conversation in Brazilian Portuguese. Speaker Mentor is a man — calm, consultative, experienced and clear. Speaker Campo is a woman — practical, direct and grounded in field reality. Keep a professional, adult tone and natural turn-taking:\n\n${textoComMarca}`
    : `Narre em português do Brasil, com voz feminina, tom acolhedor, seguro e íntimo, ritmo moderado e pausas reflexivas naturais:\n\n${textoComMarca}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: styled }] }], // role:'user' exigido pelo Vertex
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

  // Mesmo caminho (AI Studio ou Vertex) com retry — ver ttsGenerate. Single-speaker
  // passa pelo portão de deriva (com retake); multi-speaker não: F0 e timbre alternam
  // entre Mentor e Campo por construção, e a régua acusaria a alternância como defeito.
  const ledgerEfetivo = ledger || { feature: 'tts_podcast' };
  const timeoutMs = timeoutAdaptativo(textoComMarca.length);
  const r: { pcm: Buffer; sampleRate: number; qa?: QaDeriva } = multiSpeaker
    ? await ttsGenerate(body, ledgerEfetivo, 0, timeoutMs)
    : await sintetizarComPortao(() => ttsGenerate(body, ledgerEfetivo, 0, timeoutMs), VOICE, ledgerEfetivo.feature, opts, ledgerEfetivo);
  const mixedPcm = addPodcastBrandSting(r.pcm, r.sampleRate);
  const out: PodcastAudioFile = {
    buffer: exportPodcastMp3FromPcm(mixedPcm, r.sampleRate),
    contentType: 'audio/mpeg',
    extension: 'mp3',
  };
  if (r.qa) out.qa = r.qa;
  return out;
}

/**
 * Gera o mesmo podcast final, mas com saudação nominal antes do conteúdo.
 * O caller deve passar a narração limpa extraída do roteiro.
 */
export async function generatePersonalizedPodcastAudio(
  texto: string,
  nomeCompleto: string,
  ledger?: TtsLedger,
  opts: OpcoesPortao = {},
): Promise<PodcastAudioFile> {
  const textoPersonalizado = buildPersonalizedPodcastNarration(texto, nomeCompleto);
  return generatePodcastAudio(textoPersonalizado, ledger || { feature: 'tts_podcast_personalizado' }, opts);
}
