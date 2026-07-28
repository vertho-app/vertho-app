/**
 * Geração de embeddings — provider-agnóstico via env EMBEDDING_PROVIDER.
 *
 * Setup:
 *   EMBEDDING_PROVIDER=openai|voyage|none (default: none — desabilitado)
 *   OPENAI_API_KEY=...   (se openai)
 *   VOYAGE_API_KEY=...   (se voyage)
 *
 * Modelos default:
 *   openai → text-embedding-3-small (output 1024 via param)
 *   voyage → voyage-3-large (1024 nativo)
 *
 * Quando provider=none, embedTexts() retorna [] silenciosamente — callers
 * devem fazer fallback pra FTS (kb_search) sem quebrar.
 */

export type EmbeddingProvider = 'openai' | 'voyage' | 'none';

export interface EmbedResult {
  vector: number[];
  model: string;
}

const EMBEDDING_DIM = 1024;

function getProvider(): EmbeddingProvider {
  const p = (process.env.EMBEDDING_PROVIDER || 'none').toLowerCase();
  if (p === 'openai' || p === 'voyage') return p;
  return 'none';
}

/**
 * Cache por PROCESSO (texto → vetor). O mesmo descritor é consultado muitas vezes na
 * mesma execução: o resolver de módulo-base chama `embedQuery(descritor)` a cada
 * conteúdo, e um lote gera 3 formatos × N DISC do MESMO tema. Sem cache, um lote de 42
 * DISC virava dezenas de chamadas idênticas — e num provider limitado isso é a
 * diferença entre seleção semântica e token-matching (F-I13).
 * Não persiste: escopo de processo basta para o padrão de uso (lote/request).
 */
const cacheVetor = new Map<string, EmbedResult>();
const CACHE_MAX = 500;

/** Quantas vezes o embedding falhou nesta execução — o silêncio era o problema. */
let falhasEmbedding = 0;
export function estatisticasEmbedding() {
  return { falhas: falhasEmbedding, cacheSize: cacheVetor.size };
}

/** Erro que vale reesperar: rate limit e indisponibilidade momentânea. */
function transitorio(err: unknown): boolean {
  const m = String((err as any)?.message || err);
  return /\b(429|500|502|503|504)\b/.test(m) || /rate limit|timeout|ETIMEDOUT|ECONNRESET/i.test(m);
}

/**
 * Gera embedding pra um texto. Retorna null se provider=none ou se quebra
 * (callers devem tolerar e cair pro FTS/tokens).
 *
 * Com cache por processo e 2 retentativas em erro TRANSITÓRIO (429 inclusive) —
 * antes, um único 429 desligava a semântica em silêncio para o resto do lote.
 */
export async function embedText(text: string): Promise<EmbedResult | null> {
  const provider = getProvider();
  if (provider === 'none') return null;
  if (!text || !text.trim()) return null;

  const chave = `${provider}:${text.slice(0, 8000)}`;
  const emCache = cacheVetor.get(chave);
  if (emCache) return emCache;

  const TENTATIVAS = 3;
  for (let i = 0; i < TENTATIVAS; i++) {
    try {
      const r = provider === 'openai' ? await embedOpenAI(text) : await embedVoyage(text);
      if (r) {
        // Descarte simples: mapa grande em processo longo não compensa complexidade.
        if (cacheVetor.size >= CACHE_MAX) cacheVetor.clear();
        cacheVetor.set(chave, r);
      }
      return r;
    } catch (err) {
      const ultima = i === TENTATIVAS - 1;
      if (!ultima && transitorio(err)) {
        await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, i)));   // 1,5s · 3s
        continue;
      }
      falhasEmbedding++;
      // Loga ALTO: quem consome cai em tokens/FTS sem saber, e essa degradação
      // silenciosa deixou 198 de 216 módulos-base sem vetor sem ninguém notar.
      console.error(`[embedText] ${provider} FALHOU (${falhasEmbedding} nesta execução) — consumidor cairá em tokens/FTS:`, err);
      return null;
    }
  }
  return null;
}

/**
 * Versão batch — mais econômica quando rodando backfill.
 * Mantém ordem do input.
 */
export async function embedTexts(texts: string[]): Promise<(EmbedResult | null)[]> {
  const provider = getProvider();
  if (provider === 'none' || !texts.length) return texts.map(() => null);

  // Por simplicidade do MVP, faz serial. Otimizar pra batch nativo depois.
  const out: (EmbedResult | null)[] = [];
  for (const t of texts) {
    out.push(await embedText(t));
  }
  return out;
}

async function embedOpenAI(text: string): Promise<EmbedResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurado (provider=openai)');
  const model = 'text-embedding-3-small';

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text.slice(0, 8000),  // limite tokens de input
      dimensions: EMBEDDING_DIM,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${detail}`);
  }
  const data: any = await res.json();
  const vector = data?.data?.[0]?.embedding as number[];
  if (!Array.isArray(vector)) throw new Error('OpenAI: embedding ausente na resposta');
  return { vector, model: `openai/${model}` };
}

async function embedVoyage(text: string): Promise<EmbedResult> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY não configurado (provider=voyage)');
  const model = 'voyage-3-large';

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [text.slice(0, 8000)],
      input_type: 'document',
      // output_dimension omitido — usa default nativo (1024)
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Voyage embeddings ${res.status}: ${detail}`);
  }
  const data: any = await res.json();
  const vector = data?.data?.[0]?.embedding as number[];
  if (!Array.isArray(vector)) throw new Error('Voyage: embedding ausente na resposta');
  return { vector, model: `voyage/${model}` };
}

/**
 * Helper: embedding pra QUERY (mesmo provider, mas alguns modelos
 * diferenciam input_type=query vs document).
 */
export async function embedQuery(text: string): Promise<EmbedResult | null> {
  const provider = getProvider();
  if (provider !== 'voyage') {
    // OpenAI não diferencia; chama embedText normal
    return embedText(text);
  }
  // Voyage: troca input_type
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey || !text?.trim()) return null;
  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'voyage-3-large',
        input: [text.slice(0, 8000)],
        input_type: 'query',
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const vector = data?.data?.[0]?.embedding as number[];
    if (!Array.isArray(vector)) return null;
    return { vector, model: 'voyage/voyage-3-large' };
  } catch {
    return null;
  }
}
