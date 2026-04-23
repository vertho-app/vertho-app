import { createSupabaseAdmin } from './supabase';
import { embedQuery, embedText } from './embeddings';

/**
 * RAG / grounding per-tenant via knowledge_base.
 *
 * Estratégia de retrieval (transparente pro caller):
 *   1. Se EMBEDDING_PROVIDER configurado → tenta híbrido FTS+vector (kb_search_hybrid)
 *   2. Se embeddings indisponíveis ou falha → cai pra FTS (kb_search)
 *
 * Filosofia: NUNCA passar dados de um tenant pra IA de outro. A função
 * sempre exige empresaId — sem default, sem "global". Isolamento é premissa.
 */

export interface KbChunk {
  id: string;
  titulo: string;
  conteudo: string;
  categoria: string | null;
  score: number;
}

export interface KbDocSummary {
  id: string;
  titulo: string;
  categoria: string | null;
  source_url: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface IngestDocInput {
  empresaId: string;
  titulo: string;
  conteudo: string;
  categoria?: string | null;
  sourceUrl?: string | null;
  criadoPor?: string | null;
}

/**
 * Busca top-k trechos mais relevantes na base do tenant.
 * Tenta híbrido (FTS + vector) se embeddings disponíveis; senão cai pra FTS puro.
 */
export async function retrieveContext(
  empresaId: string,
  query: string,
  k: number = 5,
): Promise<KbChunk[]> {
  if (!empresaId) throw new Error('retrieveContext: empresaId obrigatório');
  if (!query || typeof query !== 'string') return [];

  const sb = createSupabaseAdmin();
  const queryTrunc = query.slice(0, 500);

  // Tentativa 1: híbrido (se provider de embeddings ativo)
  const queryEmb = await embedQuery(queryTrunc);
  if (queryEmb?.vector) {
    const { data, error } = await sb.rpc('kb_search_hybrid', {
      p_empresa_id: empresaId,
      p_query: queryTrunc,
      p_query_embedding: queryEmb.vector,
      p_limit: k,
    });
    if (!error && data) return data as KbChunk[];
    console.warn('[rag] híbrido falhou, cai pra FTS:', error?.message);
  }

  // Fallback: FTS puro (default MVP)
  const { data, error } = await sb.rpc('kb_search', {
    p_empresa_id: empresaId,
    p_query: queryTrunc,
    p_limit: k,
  });

  if (error) {
    console.error('[rag.retrieveContext]', error);
    return [];
  }
  return (data as KbChunk[]) || [];
}

/**
 * Formata trechos recuperados como bloco de contexto pra injetar no prompt.
 */
export function formatGroundingBlock(chunks: KbChunk[] | null | undefined): string {
  if (!Array.isArray(chunks) || chunks.length === 0) return '';
  const blocos = chunks.map((c) => {
    const head = c.categoria
      ? `### ${c.titulo} [${c.categoria}]`
      : `### ${c.titulo}`;
    return `${head}\n${c.conteudo}`;
  });
  return `## Contexto da empresa (use APENAS se relevante à pergunta)\n\n${blocos.join('\n\n')}`;
}

/**
 * Adiciona um documento à base de conhecimento do tenant.
 * Tenta gerar embedding (se provider ativo); falha não bloqueia o insert.
 */
export async function ingestDoc({
  empresaId,
  titulo,
  conteudo,
  categoria = null,
  sourceUrl = null,
  criadoPor = null,
}: IngestDocInput): Promise<string | undefined> {
  if (!empresaId) throw new Error('ingestDoc: empresaId obrigatório');
  if (!titulo || !conteudo) throw new Error('ingestDoc: titulo+conteudo obrigatórios');

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('knowledge_base').insert({
    empresa_id: empresaId,
    titulo,
    conteudo,
    categoria,
    source_url: sourceUrl,
    criado_por: criadoPor,
    ativo: true,
  }).select('id').single();

  if (error) throw error;
  const docId = (data as { id: string } | null)?.id;

  // Best-effort: gera embedding se provider ativo. Não bloqueia o insert.
  if (docId) {
    embedText(`${titulo}\n${conteudo}`)
      .then(async (emb) => {
        if (!emb) return;
        await sb.from('knowledge_base')
          .update({
            embedding: emb.vector,
            embedding_model: emb.model,
            embedding_at: new Date().toISOString(),
          })
          .eq('id', docId);
      })
      .catch((err) => console.warn('[ingestDoc embedding bg]', err?.message));
  }

  return docId;
}

/**
 * Desativa um documento (soft delete).
 */
export async function deactivateDoc(empresaId: string, docId: string): Promise<void> {
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('knowledge_base')
    .update({ ativo: false })
    .eq('empresa_id', empresaId)
    .eq('id', docId);
  if (error) throw error;
}

/**
 * Lista todos os docs ativos do tenant (pra painel de admin).
 */
export async function listDocs(empresaId: string): Promise<KbDocSummary[]> {
  if (!empresaId) throw new Error('listDocs: empresaId obrigatório');
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('knowledge_base')
    .select('id, titulo, categoria, source_url, criado_em, atualizado_em')
    .eq('empresa_id', empresaId)
    .neq('ativo', false)
    .order('atualizado_em', { ascending: false });
  return (data as KbDocSummary[]) || [];
}
