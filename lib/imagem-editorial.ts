/**
 * Imagem editorial do PDF de conteúdo (capa e seção de texto/case): gera APENAS
 * um fundo ilustrado — sem texto, letras ou logo (a IA de imagem distorce
 * texto). O texto real é aplicado por camada controlada no @react-pdf.
 *
 * ── Dois provedores, nesta ordem (decisão do dono, 24/09/2026) ──
 *   1. OpenAI `gpt-image-2.5-flare`, qualidade `medium` (env `OPENAI_IMAGE_MODEL`).
 *   2. Gemini `gemini-3.1-flash-image`, 1K (env `GEMINI_IMAGE_MODEL`) — fallback.
 *
 * 🔴 Por que o fallback existe. `Medido: 24/09/2026` — a última imagem gravada no
 * cache era de 24/06. Por três meses TODO PDF de texto/case saiu com o fundo
 * vetorial, porque o projeto da OpenAI perdeu acesso ao `gpt-image-2`
 * (`403 model_not_found`) e o único rastro era um `console.warn`: os PDFs caíram
 * de ~3,7 MB para ~200 KB e ninguém viu. É a classe do Luna 401 e do alias
 * `gpt-5.4` morto — permissão de modelo por projeto OpenAI não é estável. Daí:
 *   · cair no fallback, ou nos dois falharem, grava `degradacao_log` (a R10 do
 *     health lê);
 *   · cada imagem PAGA grava `ia_usage_log`. Antes a imagem não aparecia em
 *     custo nenhum: é HTTP direto, fora do wrapper de LLM.
 *
 * ⚠️ Os dois provedores NÃO devolvem o mesmo formato: a OpenAI devolve PNG e o
 * Gemini JPEG (medido na chamada real de 24/09). O tipo vem dos BYTES
 * (`mimeDaImagem`), e decide a extensão do cache e o data URI do PDF — um JPEG
 * embrulhado como `image/png` quebra o render.
 *
 * Preço oficial lido em 24/09/2026 (catálogo em `lib/ia-cost-catalog.ts`):
 * gpt-image-2.5 = texto de entrada US$ 5/1M, imagem gerada US$ 30/1M;
 * gemini-3.1-flash-image = entrada US$ 0,50/1M, imagem US$ 60/1M (1.120 tokens
 * por imagem 1K = US$ 0,067), texto/raciocínio de saída US$ 3/1M.
 */
import { costFromTokens } from './ia-cost-catalog';
import { gravarLinhaLedger } from './ia-ledger';
import { registrarDegradacao, DEGRADACAO } from './degradacao';

/** Lidos em RUNTIME: `const` de topo leria o env antes do `.env` dos scripts. */
const modeloOpenAI = () => process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare';
const modeloGemini = () => process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';

const OPENAI_API = 'https://api.openai.com/v1/images/generations';
const GEMINI_API = (modelo: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

/** A OpenAI em `medium` leva 20-60s; o Gemini ~10s (medido 24/09). */
const TIMEOUT_MS = 110_000;

export type FormatoImagem = 'retrato' | 'paisagem';
export type TipoImagemPdf = 'capa' | 'secao';
/** Só o que o @react-pdf renderiza: PNG e JPEG. */
export type MimeImagem = 'image/png' | 'image/jpeg';

const TAMANHO_OPENAI: Record<FormatoImagem, string> = { retrato: '1024x1536', paisagem: '1536x1024' };
const PROPORCAO_GEMINI: Record<FormatoImagem, string> = { retrato: '2:3', paisagem: '3:2' };

/** Famílias de tratamento visual — sorteadas a cada geração p/ forçar variedade
 *  (mesmo tema/competência não converge sempre pra mesma imagem). */
const COVER_TREATMENTS = [
  'abstract architectural forms — arches, layered walls, doorways, staircases — with strong depth and perspective',
  'a natural landscape element (mountains, ocean, sky, canyon, dunes, forest) interpreted cinematically',
  'a single symbolic 3D object resting on a clean reflective surface, studio-lit',
  'flowing light trails, particles and luminous energy across dark negative space',
  'abstract geometric / network / data-inspired forms — nodes, lattices, waves, fragments',
  'an atmospheric interior or environment with strong perspective and depth',
  'organic forms — growth, layers, crystalline or topographic structures',
];

/**
 * Prompt de fundo de capa: ILUSTRAÇÃO editorial conceitual que evoca o tema
 * do conteúdo (metáfora visual), não apenas formas abstratas. Mantém a coluna
 * esquerda como navy calmo pro título ficar legível; a cena vive à direita.
 * @param tema competência + descritor do conteúdo (guia a metáfora).
 */
export function buildCoverPrompt(tema?: string | null): string {
  const palette = COVER_TREATMENTS.join('; ');
  const conceito = tema
    ? `Create ONE specific, elegant conceptual metaphor that a viewer would IMMEDIATELY associate with this exact topic: "${tema}". Relevance to the topic comes FIRST — the image must read as being about this topic at a glance, never generic abstract decoration that could belong to any subject. Pick the visual language that best expresses THIS topic from: ${palette}. Two different topics must yield clearly different images.`
    : `Create a single elegant conceptual metaphor about professional growth and clarity, choosing the best-fitting visual language from: ${palette}.`;
  return [
    'Premium EDITORIAL ILLUSTRATION for the A4 vertical cover of an institutional professional-development guide by Vertho.',
    'Deep navy (#142F57) dominant palette with cyan (#34C5CC) and light cyan (#9AE2E6) accents; sophisticated, modern, cinematic lighting with soft glow.',
    conceito,
    'Composition: keep the LEFT ~45% as calm, almost-solid deep navy negative space (reserved for a title); place the illustrated scene on the RIGHT and lower-right, flowing gently toward the center.',
    'Style: refined modern editorial illustration / subtle 3D, premium and minimal, depth and atmosphere, tasteful — NOT a flat icon, NOT a busy collage.',
    'AVOID overused clichés — do NOT use a glowing winding road / path / highway leading to a horizon, and do NOT use a lone chess piece, unless absolutely essential to the topic. Prefer a fresh, specific image.',
    'STRICTLY NO text, NO letters, NO numbers, NO words, NO logo, NO people, NO faces, NO cartoon, NO clipart, NO childish elements, NO stock-photo watermark look.',
  ].filter(Boolean).join(' ');
}

/**
 * Prompt para a imagem conceitual de SEÇÃO (banda larga, horizontal) usada numa
 * página interna do conteúdo premium. Diferente da capa: cena ocupa toda a
 * largura (será coberta por um scrim navy só na faixa de texto), atmosfera
 * editorial coerente com o tema. Sem coluna reservada.
 */
export function buildSectionPrompt(tema?: string | null): string {
  const palette = COVER_TREATMENTS.join('; ');
  const conceito = tema
    ? `Evoke the SPECIFIC topic of this content: "${tema}" with a metaphor a viewer would clearly connect to this exact topic — relevance first, never generic decoration. Pick the visual language that best fits THIS topic from: ${palette}. Sophisticated and editorial.`
    : `Evoke professional growth, clarity and human development, choosing the best-fitting visual language from: ${palette}.`;
  return [
    'Premium EDITORIAL ILLUSTRATION to be used as a wide horizontal section band inside an institutional professional-development guide by Vertho.',
    'Deep navy (#142F57) dominant palette with cyan (#34C5CC) and light cyan (#9AE2E6) accents; sophisticated, modern, cinematic lighting with soft glow and depth.',
    conceito,
    'Composition: a full-width atmospheric scene with calm, evenly distributed depth — no important subject jammed into a single corner, so it reads well as a horizontal banner.',
    'Style: refined modern editorial illustration / subtle 3D, premium and minimal, atmospheric — NOT a flat icon, NOT a busy collage.',
    'AVOID overused clichés — no glowing winding road/path/highway to a horizon, no lone chess piece. Prefer a fresh, specific image.',
    'STRICTLY NO text, NO letters, NO numbers, NO words, NO logo, NO people, NO faces, NO cartoon, NO clipart, NO childish elements, NO stock-photo watermark look.',
  ].filter(Boolean).join(' ');
}

/** Tipo pela assinatura dos bytes. `null` = formato que o @react-pdf não desenha. */
export function mimeDaImagem(buf: Buffer): MimeImagem | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

/** De quem é o custo da imagem no ledger. */
export interface LedgerImagem {
  feature: string;
  empresaId: string | null;
}

export interface ImagemGerada {
  buffer: Buffer;
  mimeType: MimeImagem;
  provedor: 'openai' | 'gemini';
  modelo: string;
  /** Por que o principal caiu, quando quem gerou foi o fallback. */
  falhaPrincipal: string | null;
}

const msg = (e: unknown) => (e as any)?.message || String(e);

async function postComTeto(url: string, init: RequestInit, rotulo: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`${rotulo}: timeout (${TIMEOUT_MS / 1000}s)`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Grava a chamada PAGA no ledger. Resposta 200 sem imagem também é cobrada, por
 * isso entra com `status` diferente de `ok` em vez de sumir.
 */
async function registrarUso(
  ledger: LedgerImagem,
  u: { provider: string; modelo: string; inTokens: number; outTokens: number; outTextTokens?: number; latencyMs: number; status: string },
) {
  await gravarLinhaLedger({
    feature: ledger.feature,
    empresa_id: ledger.empresaId ?? null,
    provider: u.provider,
    model: u.modelo,
    input_tokens: u.inTokens,
    output_tokens: u.outTokens + (u.outTextTokens || 0),
    cost_usd: costFromTokens(u.modelo, { inTokens: u.inTokens, outTokens: u.outTokens, outTextTokens: u.outTextTokens }),
    latency_ms: u.latencyMs,
    status: u.status,
    source: `imagem:${u.provider}`,
  });
}

async function gerarOpenAI(prompt: string, formato: FormatoImagem, ledger: LedgerImagem): Promise<{ buffer: Buffer; mimeType: MimeImagem; modelo: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY ausente');
  const modelo = modeloOpenAI();
  const t0 = Date.now();
  const res = await postComTeto(OPENAI_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelo, prompt, size: TAMANHO_OPENAI[formato], quality: 'medium', n: 1 }),
  }, 'OpenAI image');
  // Erro HTTP (403 de acesso, 429, 5xx) não gera imagem nem cobrança: não vai ao ledger.
  if (!res.ok) throw new Error(`OpenAI image ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  const usage = data?.usage;
  if (usage) {
    await registrarUso(ledger, {
      provider: 'openai', modelo,
      inTokens: Number(usage.input_tokens) || 0,
      outTokens: Number(usage.output_tokens) || 0,
      latencyMs: Date.now() - t0,
      status: b64 ? 'ok' : 'sem_imagem',
    });
  }
  if (!b64) throw new Error('OpenAI image: resposta sem b64_json');
  const buffer = Buffer.from(b64, 'base64');
  const mimeType = mimeDaImagem(buffer);
  if (!mimeType) throw new Error('OpenAI image: formato que o PDF não desenha (esperado PNG ou JPEG)');
  return { buffer, mimeType, modelo };
}

async function gerarGemini(prompt: string, formato: FormatoImagem, ledger: LedgerImagem): Promise<{ buffer: Buffer; mimeType: MimeImagem; modelo: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY ausente');
  const modelo = modeloGemini();
  const t0 = Date.now();
  const res = await postComTeto(GEMINI_API(modelo), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: PROPORCAO_GEMINI[formato], imageSize: '1K' },
      },
    }),
  }, 'Gemini image');
  if (!res.ok) throw new Error(`Gemini image ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
  // O raciocínio pode devolver imagens de rascunho marcadas `thought: true`; a
  // final é a última parte com imagem que não é pensamento.
  const final = [...parts].reverse().find((p) => p?.inlineData?.data && !p?.thought);

  const u = data?.usageMetadata;
  if (u) {
    // A tarifa depende da MODALIDADE: imagem a US$ 60/1M, texto e raciocínio a
    // US$ 3/1M. Medido 24/09: 1.543 tokens de saída = 1.120 de imagem + 423 de
    // texto; cobrar tudo a 60 inflaria a linha em ~35%.
    const imagem = (u.candidatesTokensDetails || [])
      .filter((d: any) => d?.modality === 'IMAGE')
      .reduce((s: number, d: any) => s + (Number(d.tokenCount) || 0), 0);
    const saida = (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0);
    await registrarUso(ledger, {
      provider: 'gemini', modelo,
      inTokens: Number(u.promptTokenCount) || 0,
      outTokens: imagem,
      outTextTokens: Math.max(0, saida - imagem),
      latencyMs: Date.now() - t0,
      status: final ? 'ok' : 'sem_imagem',
    });
  }
  if (!final) {
    throw new Error(`Gemini image: resposta sem imagem (finishReason ${data?.candidates?.[0]?.finishReason ?? '?'})`);
  }
  const buffer = Buffer.from(final.inlineData.data, 'base64');
  const mimeType = mimeDaImagem(buffer);
  if (!mimeType) throw new Error(`Gemini image: formato que o PDF não desenha (${final.inlineData.mimeType})`);
  return { buffer, mimeType, modelo };
}

async function registrarQueda(fase: 'fallback' | 'sem-imagem' | 'cache', ledger: LedgerImagem, detalhe: Record<string, unknown>) {
  await registrarDegradacao({
    fluxo: 'build',
    tipo: DEGRADACAO.IMAGEM_PDF_DEGRADADA,
    // Uma linha por fase E modelo principal por dia: o volume é a medida, não a lista.
    chave: `${fase}:${modeloOpenAI()}`,
    empresaId: ledger.empresaId,
    severidade: 'aviso',
    detalhe: { fase, feature: ledger.feature, ...detalhe },
  });
}

/**
 * Gera a imagem pelo principal e, se ele falhar por QUALQUER motivo (acesso,
 * timeout, resposta sem imagem, formato), pelo fallback. Lança se os dois
 * falharem — quem chama decide o fundo vetorial.
 */
export async function gerarImagemEditorial(
  prompt: string,
  formato: FormatoImagem,
  opts: { ledger: LedgerImagem },
): Promise<ImagemGerada> {
  let falhaPrincipal: string;
  try {
    const r = await gerarOpenAI(prompt, formato, opts.ledger);
    return { ...r, provedor: 'openai', falhaPrincipal: null };
  } catch (e) {
    falhaPrincipal = msg(e);
  }
  try {
    const r = await gerarGemini(prompt, formato, opts.ledger);
    console.warn(`[imagem-editorial] principal falhou, gerada pelo fallback (${r.modelo}):`, falhaPrincipal);
    await registrarQueda('fallback', opts.ledger, { erro: falhaPrincipal.slice(0, 300), modeloFallback: r.modelo });
    return { ...r, provedor: 'gemini', falhaPrincipal };
  } catch (e) {
    const erro = `principal: ${falhaPrincipal} | fallback: ${msg(e)}`;
    await registrarQueda('sem-imagem', opts.ledger, { erro: erro.slice(0, 600) });
    throw new Error(erro);
  }
}

// ── Cache por competência × descritor (Storage `conteudos`) ──────────────────

/** O que o resolvedor precisa do conteúdo. `empresaId` é só atribuição de custo. */
export interface ConteudoImagemPdf {
  id?: string | null;
  competencia?: string | null;
  descritor?: string | null;
  empresaId: string | null;
}

/**
 * Chave de cache das imagens (capa/seção): COMPETÊNCIA + DESCRITOR — não o id do
 * conteúdo. Assim, todos os conteúdos da mesma competência/descritor REUSAM a
 * mesma imagem (sem regenerar a cada conteúdo). Sem comp/descritor, cai no id
 * (isolado). O tema da imagem usa só comp/descritor (não o título), já que a
 * imagem é compartilhada entre títulos diferentes da mesma comp/descritor.
 */
export function slugImagemPdf(c: ConteudoImagemPdf): string {
  const base = [c?.competencia, c?.descritor].map((x) => String(x || '').trim()).filter(Boolean).join('__');
  const slug = base.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120).toLowerCase();
  return slug || `id_${c?.id}`;
}

function temaImagemPdf(c: ConteudoImagemPdf): string | null {
  return [c?.competencia, c?.descritor].filter(Boolean).join(' — ') || null;
}

const PASTA: Record<TipoImagemPdf, string> = { capa: 'final/covers/cd', secao: 'final/sections/cd' };
const EXTENSAO: Record<MimeImagem, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };
const dataUri = (buf: Buffer, mime: MimeImagem) => `data:${mime};base64,${buf.toString('base64')}`;

/**
 * Devolve o data URI da capa ou da seção, do cache ou recém-gerada. Nunca lança:
 * sem imagem, `dataUri` volta `null` e o PDF usa o fundo vetorial.
 *
 * O cache aceita as duas extensões: `.png` (o formato de sempre, e o da OpenAI)
 * e `.jpg` (o do fallback Gemini).
 */
export async function resolverImagemPdf(
  sb: any,
  tipo: TipoImagemPdf,
  c: ConteudoImagemPdf,
): Promise<{ dataUri: string | null; erro: string | null; origem: 'cache' | 'gerada' | null }> {
  const base = `${PASTA[tipo]}/${slugImagemPdf(c)}`;
  for (const ext of ['png', 'jpg']) {
    try {
      const { data, error } = await sb.storage.from('conteudos').download(`${base}.${ext}`);
      if (error || !data) continue;
      const buf = Buffer.from(await data.arrayBuffer());
      const mime = mimeDaImagem(buf);
      if (buf.length > 1024 && mime) return { dataUri: dataUri(buf, mime), erro: null, origem: 'cache' };
    } catch { /* cache ilegível conta como ausente */ }
  }

  const tema = temaImagemPdf(c);
  try {
    const img = tipo === 'capa'
      ? await gerarImagemEditorial(buildCoverPrompt(tema), 'retrato', { ledger: { feature: 'conteudo_imagem_capa', empresaId: c.empresaId } })
      : await gerarImagemEditorial(buildSectionPrompt(tema), 'paisagem', { ledger: { feature: 'conteudo_imagem_secao', empresaId: c.empresaId } });

    const caminho = `${base}.${EXTENSAO[img.mimeType]}`;
    const { error: upErr } = await sb.storage.from('conteudos')
      .upload(caminho, img.buffer, { contentType: img.mimeType, upsert: true });
    if (upErr) {
      // A imagem já foi PAGA e serve este PDF; o que se perde é o cache — o
      // próximo PDF do mesmo tema paga de novo, e sem esta linha pagaria calado.
      console.warn(`[imagem-editorial] ${tipo} gerada mas não gravou no cache (${caminho}):`, upErr.message);
      await registrarQueda('cache', { feature: `conteudo_imagem_${tipo}`, empresaId: c.empresaId }, { caminho, erro: upErr.message });
    }
    return { dataUri: dataUri(img.buffer, img.mimeType), erro: null, origem: 'gerada' };
  } catch (e) {
    return { dataUri: null, erro: msg(e), origem: null };
  }
}
