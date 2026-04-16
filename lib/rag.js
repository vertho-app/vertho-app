import { createSupabaseAdmin } from './supabase';

/**
 * RAG / grounding per-tenant via knowledge_base.
 *
 * MVP: retrieval usa Postgres FTS (tsvector PT-BR). Não precisa de provider
 * de embeddings externo. Quando subirmos pgvector + embeddings, este arquivo
 * é o único que muda — callers continuam idênticos.
 *
 * Uso típico:
 *   const ctx = await retrieveContext(empresaId, "como funciona o banco de horas?");
 *   const system = buildSystem({ ..., groundingContext: ctx });
 *
 * Filosofia: NUNCA passar dados de um tenant pra IA de outro. A função
 * sempre exige empresaId — sem default, sem "global". Isolamento é premissa.
 */

/**
 * Busca top-k trechos mais relevantes na base do tenant.
 *
 * @param {string} empresaId - tenant owner da busca (obrigatório)
 * @param {string} query - pergunta ou trecho pra buscar
 * @param {number} k - top-K resultados (default 5)
 * @returns {Promise<Array<{id, titulo, conteudo, categoria, score}>>}
 */
export async function retrieveContext(empresaId, query, k = 5) {
  if (!empresaId) throw new Error('retrieveContext: empresaId obrigatório');
  if (!query || typeof query !== 'string') return [];

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.rpc('kb_search', {
    p_empresa_id: empresaId,
    p_query: query.slice(0, 500),  // limita query pra evitar timeout FTS
    p_limit: k,
  });

  if (error) {
    console.error('[rag.retrieveContext]', error);
    return [];
  }
  return data || [];
}

/**
 * Formata trechos recuperados como bloco de contexto pra injetar no prompt.
 *
 * Padrão:
 *   ## Contexto da empresa
 *   ### [título 1]
 *   conteúdo...
 *   ### [título 2]
 *   ...
 *
 * Se não houver resultados, retorna string vazia — prompt deve lidar.
 *
 * @param {Array} chunks - saída de retrieveContext
 * @returns {string}
 */
export function formatGroundingBlock(chunks) {
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
 *
 * @param {Object} args
 * @param {string} args.empresaId
 * @param {string} args.titulo
 * @param {string} args.conteudo
 * @param {string} [args.categoria] - regulamento/valores/cargos/faq/onboarding
 * @param {string} [args.sourceUrl]
 * @param {string} [args.criadoPor] - colaborador_id
 */
export async function ingestDoc({
  empresaId,
  titulo,
  conteudo,
  categoria = null,
  sourceUrl = null,
  criadoPor = null,
}) {
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
  return data?.id;
}

/**
 * Desativa um documento (soft delete).
 */
export async function deactivateDoc(empresaId, docId) {
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
export async function listDocs(empresaId) {
  if (!empresaId) throw new Error('listDocs: empresaId obrigatório');
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('knowledge_base')
    .select('id, titulo, categoria, source_url, criado_em, atualizado_em')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('atualizado_em', { ascending: false });
  return data || [];
}
