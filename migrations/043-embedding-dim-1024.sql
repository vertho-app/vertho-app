-- 043: Muda dimensão do embedding de 1536 → 1024
--
-- Motivação: Voyage (voyage-3-large) é nativo 1024 e não suporta 1536.
-- text-embedding-3-small da OpenAI também aceita 1024 via param `dimensions`,
-- preservando qualidade (Matryoshka). Com a base knowledge_base vazia no
-- momento da migração, não há risco — se já houver dados, TODO o conteúdo
-- precisa ser re-embeddado antes de aplicar.

-- Pré-condição: garantir que não há rows com embedding populado.
-- (Se houver, abortar e rodar um backfill pra zerar primeiro.)
DO $$
DECLARE
  cnt INT;
BEGIN
  SELECT COUNT(*) INTO cnt FROM knowledge_base WHERE embedding IS NOT NULL;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'Abortado: % rows já têm embedding. Zere-os antes (UPDATE knowledge_base SET embedding=NULL, embedding_model=NULL, embedding_at=NULL).', cnt;
  END IF;
END $$;

-- Derruba funções e índice dependentes do tipo VECTOR(1536)
DROP FUNCTION IF EXISTS kb_search_hybrid(UUID, TEXT, VECTOR(1536), INT, INT);
DROP FUNCTION IF EXISTS kb_search_semantic(UUID, VECTOR(1536), INT);
DROP INDEX IF EXISTS idx_kb_embedding;

-- Troca tipo da coluna (rows com embedding IS NULL passam direto)
ALTER TABLE knowledge_base
  ALTER COLUMN embedding TYPE VECTOR(1024);

COMMENT ON COLUMN knowledge_base.embedding IS 'Vetor semântico 1024d (voyage-3-large nativo / openai text-embedding-3-small c/ dim=1024)';

-- Recria índice IVFFLAT
CREATE INDEX IF NOT EXISTS idx_kb_embedding
  ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- Recria kb_search_semantic com nova dim
CREATE OR REPLACE FUNCTION kb_search_semantic(
  p_empresa_id UUID,
  p_query_embedding VECTOR(1024),
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

COMMENT ON FUNCTION kb_search_semantic IS 'Busca semântica via cosine distance (1024d).';

-- Recria kb_search_hybrid (RRF FTS+vector) com nova dim
CREATE OR REPLACE FUNCTION kb_search_hybrid(
  p_empresa_id UUID,
  p_query TEXT,
  p_query_embedding VECTOR(1024),
  p_limit INT DEFAULT 5,
  p_k INT DEFAULT 60
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

COMMENT ON FUNCTION kb_search_hybrid IS 'RRF: FTS + vector 1024d.';

-- Rollback (se precisar):
-- DROP FUNCTION IF EXISTS kb_search_hybrid;
-- DROP FUNCTION IF EXISTS kb_search_semantic;
-- DROP INDEX IF EXISTS idx_kb_embedding;
-- ALTER TABLE knowledge_base ALTER COLUMN embedding TYPE VECTOR(1536);
-- (depois recriar funções+índice com 1536)
