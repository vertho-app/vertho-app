-- Migration 059 — pg_trgm para busca rápida
-- ilike '%termo%' degrada linearmente com volume. Com gin_trgm_ops o
-- Postgres usa GIN index e mantém latência <50ms até dezenas de milhões
-- de linhas.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_diag_escolas_nome_trgm
  ON diag_escolas USING gin (nome gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_diag_escolas_municipio_trgm
  ON diag_escolas USING gin (municipio gin_trgm_ops);
