-- 042: Habilita pgvector + adiciona coluna embedding em knowledge_base
--
-- A coluna embedding é NULLABLE e ativa só quando configurarmos um provider
-- (Voyage AI, OpenAI ou similar). Enquanto não houver embedding gerado, o
-- retrieval continua usando FTS (kb_search) — sem regressão.
--
-- Quando houver população de embeddings:
--   1. Backfill: gerar embeddings pra todos rows existentes
--   2. Trocar kb_search pra usar similaridade por cosine (vector_cosine_ops)
--   3. Híbrido (RRF) combina FTS + vector pro melhor resultado

CREATE EXTENSION IF NOT EXISTS vector;

-- Dimensão 1536 = OpenAI text-embedding-3-small. Voyage voyage-3-large = 1024.
-- Escolhemos 1536 pra cobrir os dois (Voyage também aceita output 1536).
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS embedding VECTOR(1536),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_at TIMESTAMPTZ;

COMMENT ON COLUMN knowledge_base.embedding IS 'Vetor semântico do título+conteúdo. NULL até backfill.';
COMMENT ON COLUMN knowledge_base.embedding_model IS 'ex: openai/text-embedding-3-small, voyage/voyage-3-large';
COMMENT ON COLUMN knowledge_base.embedding_at IS 'Quando o embedding foi calculado (pra invalidar quando o conteudo muda)';

-- Índice IVFFLAT pra similaridade cosine (melhor balance entre velocidade e recall).
-- lists ≈ sqrt(N rows) — ajustar quando passar de 10k rows.
CREATE INDEX IF NOT EXISTS idx_kb_embedding
  ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- Função de busca semântica (usado quando quiser substituir kb_search).
-- Mantém kb_search atual (FTS) — esta é nova função coexistente.
CREATE OR REPLACE FUNCTION kb_search_semantic(
  p_empresa_id UUID,
  p_query_embedding VECTOR(1536),
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  titulo TEXT,
  conteudo TEXT,
  categoria TEXT,
  score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.titulo,
    kb.conteudo,
    kb.categoria,
    (1 - (kb.embedding <=> p_query_embedding))::REAL AS score
  FROM knowledge_base kb
  WHERE kb.empresa_id = p_empresa_id
    AND kb.ativo = true
    AND kb.embedding IS NOT NULL
  ORDER BY kb.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION kb_search_semantic IS 'Busca semântica via cosine distance. Usar quando embeddings estiverem populados.';

-- Função híbrida RRF (Reciprocal Rank Fusion) — combina FTS + semantic.
-- Padrão da industria pra unir signals lexical e semântico.
CREATE OR REPLACE FUNCTION kb_search_hybrid(
  p_empresa_id UUID,
  p_query TEXT,
  p_query_embedding VECTOR(1536),
  p_limit INT DEFAULT 5,
  p_k INT DEFAULT 60  -- constante RRF (60 é padrão)
)
RETURNS TABLE (
  id UUID,
  titulo TEXT,
  conteudo TEXT,
  categoria TEXT,
  score REAL
) AS $$
BEGIN
  RETURN QUERY
  WITH fts AS (
    SELECT kb.id,
           ROW_NUMBER() OVER (ORDER BY ts_rank(kb.tsv, plainto_tsquery('portuguese', p_query)) DESC) AS rnk
    FROM knowledge_base kb
    WHERE kb.empresa_id = p_empresa_id AND kb.ativo = true
      AND kb.tsv @@ plainto_tsquery('portuguese', p_query)
    LIMIT p_limit * 4
  ),
  sem AS (
    SELECT kb.id,
           ROW_NUMBER() OVER (ORDER BY kb.embedding <=> p_query_embedding) AS rnk
    FROM knowledge_base kb
    WHERE kb.empresa_id = p_empresa_id AND kb.ativo = true
      AND kb.embedding IS NOT NULL
    ORDER BY kb.embedding <=> p_query_embedding
    LIMIT p_limit * 4
  ),
  fused AS (
    SELECT id,
           SUM(1.0 / (p_k + rnk))::REAL AS score
    FROM (SELECT id, rnk FROM fts UNION ALL SELECT id, rnk FROM sem) u
    GROUP BY id
    ORDER BY score DESC
    LIMIT p_limit
  )
  SELECT
    kb.id,
    kb.titulo,
    kb.conteudo,
    kb.categoria,
    f.score
  FROM fused f
  JOIN knowledge_base kb ON kb.id = f.id
  ORDER BY f.score DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION kb_search_hybrid IS 'RRF: combina FTS + vector semantic. Melhor recall que qualquer um isolado.';

-- Rollback (se precisar):
-- DROP FUNCTION IF EXISTS kb_search_hybrid;
-- DROP FUNCTION IF EXISTS kb_search_semantic;
-- DROP INDEX IF EXISTS idx_kb_embedding;
-- ALTER TABLE knowledge_base DROP COLUMN IF EXISTS embedding_at,
--                            DROP COLUMN IF EXISTS embedding_model,
--                            DROP COLUMN IF EXISTS embedding;
-- DROP EXTENSION IF EXISTS vector;
