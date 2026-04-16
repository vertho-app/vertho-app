-- 041: Knowledge base per-tenant — fundação de RAG/grounding
--
-- MVP usa Postgres FTS (tsvector PT-BR) pra retrieval. Funciona sem
-- provider de embeddings externo. Coluna `embedding` já existe pra
-- upgrade futuro a pgvector sem nova migração estrutural.
--
-- Uso típico:
--   - RH alimenta: regulamento interno, valores, glossário de cargos,
--     políticas, FAQ, docs de onboarding.
--   - IA (Tira-Dúvidas, Evidências) consulta antes de responder.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- pgvector fica comentado até termos embedding pipeline.
-- CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  categoria TEXT,  -- ex: 'regulamento', 'valores', 'cargos', 'faq', 'onboarding'
  source_url TEXT,  -- opcional: link pro doc original
  -- Tsvector gerado automaticamente (título peso A, conteúdo peso B)
  tsv TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(titulo, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(conteudo, '')), 'B')
  ) STORED,
  -- Espaço reservado pra embedding semântico (upgrade futuro pgvector)
  -- embedding VECTOR(1536),
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  criado_por UUID REFERENCES colaboradores(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_kb_empresa ON knowledge_base(empresa_id) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_kb_tsv ON knowledge_base USING GIN(tsv);
CREATE INDEX IF NOT EXISTS idx_kb_trgm_titulo ON knowledge_base USING GIN(titulo gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_kb_categoria ON knowledge_base(empresa_id, categoria);

COMMENT ON TABLE knowledge_base IS 'Base de conhecimento per-tenant pra grounding de IA (Tira-Dúvidas, Evidências etc.)';
COMMENT ON COLUMN knowledge_base.tsv IS 'Tsvector gerado (PT-BR) — usado pelo retrieveContext via FTS';
COMMENT ON COLUMN knowledge_base.categoria IS 'Facet opcional: regulamento, valores, cargos, faq, onboarding';

-- RLS: isolamento por tenant
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kb_tenant_isolation ON knowledge_base;
CREATE POLICY kb_tenant_isolation ON knowledge_base
  FOR ALL
  USING (
    empresa_id IN (
      SELECT empresa_id FROM colaboradores
      WHERE auth.jwt() ->> 'email' = email
    )
  );

-- Trigger de atualizado_em
CREATE OR REPLACE FUNCTION update_kb_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kb_updated_at ON knowledge_base;
CREATE TRIGGER trg_kb_updated_at
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION update_kb_updated_at();

-- Função de busca: retorna top-k mais relevantes (FTS + ts_rank)
CREATE OR REPLACE FUNCTION kb_search(
  p_empresa_id UUID,
  p_query TEXT,
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
    ts_rank(kb.tsv, plainto_tsquery('portuguese', p_query)) AS score
  FROM knowledge_base kb
  WHERE kb.empresa_id = p_empresa_id
    AND kb.ativo = true
    AND kb.tsv @@ plainto_tsquery('portuguese', p_query)
  ORDER BY score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION kb_search IS 'Busca FTS na knowledge_base por tenant. Usado por lib/rag.js.';

-- Rollback (se precisar):
-- DROP FUNCTION IF EXISTS kb_search;
-- DROP TRIGGER IF EXISTS trg_kb_updated_at ON knowledge_base;
-- DROP FUNCTION IF EXISTS update_kb_updated_at;
-- DROP TABLE IF EXISTS knowledge_base;
