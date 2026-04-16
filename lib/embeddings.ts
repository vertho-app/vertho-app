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
 * Gera embedding pra um texto. Retorna null se provider=none ou se quebra
 * (callers devem tolerar e cair pro FTS).
 */
export async function embedText(text: string): Promise<EmbedResult | null> {
  const provider = getProvider();
  if (provider === 'none') return null;
  if (!text || !text.trim()) return null;

  try {
    if (provider === 'openai') return await embedOpenAI(text);
    if (provider === 'voyage') return await embedVoyage(text);
    return null;
  } catch (err) {
    console.error('[embedText]', provider, err);
    return null;
  }
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
