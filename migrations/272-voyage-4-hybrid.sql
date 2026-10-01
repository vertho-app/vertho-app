-- Voyage 4 em paralelo ao acervo Voyage 3. Não sobrescrever vetores legados:
-- web e workers antigos continuam operacionais durante o rollout e o rollback.
-- Rollback da aplicação: VOYAGE_EMBEDDING_MODEL=voyage-3-large (ou release anterior).
-- As colunas novas podem permanecer; não restaurar a RPC híbrida ambígua.

ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS embedding_v4 vector(1024),
  ADD COLUMN IF NOT EXISTS embedding_v4_model text,
  ADD COLUMN IF NOT EXISTS embedding_v4_at timestamptz;

ALTER TABLE public.modulos_base_conteudo
  ADD COLUMN IF NOT EXISTS descritor_embedding_v4 vector(1024),
  ADD COLUMN IF NOT EXISTS descritor_embedding_v4_model text,
  ADD COLUMN IF NOT EXISTS descritor_embedding_v4_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_kb_embedding_v4
  ON public.knowledge_base USING hnsw (embedding_v4 vector_cosine_ops)
  WHERE embedding_v4 IS NOT NULL AND embedding_v4_model = 'voyage/voyage-4-large';

-- Correção da RPC existente: id/score eram ambíguos com os parâmetros OUT do PL/pgSQL.
-- CREATE OR REPLACE preserva assinatura, SECURITY INVOKER e permissões existentes.
CREATE OR REPLACE FUNCTION public.kb_search_hybrid(
  p_empresa_id uuid,
  p_query text,
  p_query_embedding vector(1024),
  p_limit integer DEFAULT 5,
  p_k integer DEFAULT 60
)
RETURNS TABLE (id uuid, titulo text, conteudo text, categoria text, score real)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  WITH fts AS (
    SELECT kb.id, ROW_NUMBER() OVER (
      ORDER BY ts_rank(kb.tsv, plainto_tsquery('portuguese', p_query)) DESC, kb.id
    ) AS rnk
    FROM public.knowledge_base kb
    WHERE kb.empresa_id = p_empresa_id AND kb.ativo = true
      AND kb.tsv @@ plainto_tsquery('portuguese', p_query)
    ORDER BY ts_rank(kb.tsv, plainto_tsquery('portuguese', p_query)) DESC, kb.id
    LIMIT p_limit * 4
  ), sem AS (
    SELECT kb.id, ROW_NUMBER() OVER (ORDER BY kb.embedding <=> p_query_embedding, kb.id) AS rnk
    FROM public.knowledge_base kb
    WHERE kb.empresa_id = p_empresa_id AND kb.ativo = true AND kb.embedding IS NOT NULL
    ORDER BY kb.embedding <=> p_query_embedding, kb.id
    LIMIT p_limit * 4
  ), fused AS (
    SELECT u.id, SUM(1.0 / (p_k + u.rnk))::real AS score
    FROM (SELECT f.id, f.rnk FROM fts f UNION ALL SELECT s.id, s.rnk FROM sem s) u
    GROUP BY u.id
    ORDER BY SUM(1.0 / (p_k + u.rnk)) DESC, u.id
    LIMIT p_limit
  )
  SELECT kb.id, kb.titulo, kb.conteudo, kb.categoria, f.score
  FROM fused f JOIN public.knowledge_base kb ON kb.id = f.id
  ORDER BY f.score DESC, kb.id;
END;
$$;

-- RPC independente: queries Voyage 4 só enxergam vetores explicitamente da geração 4.
CREATE OR REPLACE FUNCTION public.kb_search_hybrid_v4(
  p_empresa_id uuid,
  p_query text,
  p_query_embedding vector(1024),
  p_limit integer DEFAULT 5,
  p_k integer DEFAULT 60
)
RETURNS TABLE (id uuid, titulo text, conteudo text, categoria text, score real)
LANGUAGE sql STABLE
SET hnsw.iterative_scan = 'strict_order'
AS $$
  WITH fts AS (
    SELECT kb.id, ROW_NUMBER() OVER (
      ORDER BY ts_rank(kb.tsv, plainto_tsquery('portuguese', p_query)) DESC, kb.id
    ) AS rnk
    FROM public.knowledge_base kb
    WHERE kb.empresa_id = p_empresa_id AND kb.ativo = true
      AND kb.tsv @@ plainto_tsquery('portuguese', p_query)
    ORDER BY ts_rank(kb.tsv, plainto_tsquery('portuguese', p_query)) DESC, kb.id
    LIMIT LEAST(GREATEST(p_limit, 0), 30) * 4
  ), sem AS (
    SELECT kb.id, ROW_NUMBER() OVER (ORDER BY kb.embedding_v4 <=> p_query_embedding, kb.id) AS rnk
    FROM public.knowledge_base kb
    WHERE kb.empresa_id = p_empresa_id AND kb.ativo = true
      AND kb.embedding_v4 IS NOT NULL AND kb.embedding_v4_model = 'voyage/voyage-4-large'
    ORDER BY kb.embedding_v4 <=> p_query_embedding, kb.id
    LIMIT LEAST(GREATEST(p_limit, 0), 30) * 4
  ), fused AS (
    SELECT u.id, SUM(1.0 / (GREATEST(p_k, 1) + u.rnk))::real AS score
    FROM (SELECT f.id, f.rnk FROM fts f UNION ALL SELECT s.id, s.rnk FROM sem s) u
    GROUP BY u.id
    ORDER BY SUM(1.0 / (GREATEST(p_k, 1) + u.rnk)) DESC, u.id
    LIMIT LEAST(GREATEST(p_limit, 0), 30)
  )
  SELECT kb.id, kb.titulo, kb.conteudo, kb.categoria, f.score
  FROM fused f JOIN public.knowledge_base kb ON kb.id = f.id
  ORDER BY f.score DESC, kb.id;
$$;

-- A aplicação autentica a sessão e obtém o tenant; RPC chamada apenas pelo backend.
REVOKE ALL ON FUNCTION public.kb_search_hybrid_v4(uuid, text, vector, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kb_search_hybrid_v4(uuid, text, vector, integer, integer)
  TO service_role;

-- Escritores antigos também invalidam o vetor novo quando a fonte é editada.
CREATE OR REPLACE FUNCTION public.kb_invalidate_embedding_v4()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.titulo IS DISTINCT FROM OLD.titulo OR NEW.conteudo IS DISTINCT FROM OLD.conteudo THEN
    NEW.embedding_v4 := NULL;
    NEW.embedding_v4_model := NULL;
    NEW.embedding_v4_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kb_invalidate_embedding_v4 ON public.knowledge_base;
CREATE TRIGGER kb_invalidate_embedding_v4
  BEFORE UPDATE OF titulo, conteudo ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.kb_invalidate_embedding_v4();

CREATE OR REPLACE FUNCTION public.mb_invalidate_embedding_v4()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.titulo IS DISTINCT FROM OLD.titulo OR NEW.descritor IS DISTINCT FROM OLD.descritor THEN
    NEW.descritor_embedding_v4 := NULL;
    NEW.descritor_embedding_v4_model := NULL;
    NEW.descritor_embedding_v4_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mb_invalidate_embedding_v4 ON public.modulos_base_conteudo;
CREATE TRIGGER mb_invalidate_embedding_v4
  BEFORE UPDATE OF titulo, descritor ON public.modulos_base_conteudo
  FOR EACH ROW EXECUTE FUNCTION public.mb_invalidate_embedding_v4();

NOTIFY pgrst, 'reload schema';
