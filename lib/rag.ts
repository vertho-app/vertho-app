import { createSupabaseAdmin } from './supabase';

/**
 * RAG / grounding per-tenant via knowledge_base.
 *
 * MVP: retrieval usa Postgres FTS (tsvector PT-BR). Não precisa de provider
 * de embeddings externo. Quando subirmos pgvector + embeddings, este arquivo
 * é o único que muda — callers continuam idênticos.
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
 */
export async function retrieveContext(
  empresaId: string,
  query: string,
  k: number = 5,
): Promise<KbChunk[]> {
  if (!empresaId) throw new Error('retrieveContext: empresaId obrigatório');
  if (!query || typeof query !== 'string') return [];

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.rpc('kb_search', {
    p_empresa_id: empresaId,
    p_query: query.slice(0, 500),
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
  }).select('id').single();

  if (error) throw error;
  return (data as { id: string } | null)?.id;
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
    .eq('ativo', true)
    .order('atualizado_em', { ascending: false });
  return (data as KbDocSummary[]) || [];
}
