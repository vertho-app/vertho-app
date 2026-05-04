-- ═════════════════════════════════════════════════════════════════
-- Migration 084 — Busca tolerante a acento + ordem de palavras
--
-- A busca atual (action buscarEscolasMunicipios) faz ilike '%termo%'
-- direto no nome/município. Resultado: "Itamarati Colégio" não bate
-- com "Colégio Itamarati" e "Itamarati" não bate com "Itamaratí".
--
-- Esta migration cria:
--  - extensão unaccent + wrapper imutável
--  - índices GIN trigram em colunas normalizadas (lower + unaccent)
--  - RPCs diag_buscar_escolas e diag_buscar_municipios que tokenizam
--    o termo, normalizam e exigem AND entre palavras (qualquer ordem)
-- ═════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Wrapper imutável (unaccent é STABLE, não IMMUTABLE — necessário para índice em expressão)
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT public.unaccent('public.unaccent', $1);
$$;

-- Índices GIN trigram nas formas normalizadas (lower + unaccent) — torna o
-- LIKE '%token%' rápido em ~214k linhas. Mantém os índices da mig 059.
CREATE INDEX IF NOT EXISTS idx_diag_escolas_nome_norm_gin
  ON diag_escolas USING gin (lower(public.f_unaccent(nome)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_diag_escolas_municipio_norm_gin
  ON diag_escolas USING gin (lower(public.f_unaccent(municipio)) gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────
-- RPC: busca de escolas (UF opcional, tokens AND em qualquer ordem)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION diag_buscar_escolas(
  p_termo TEXT,
  p_uf TEXT DEFAULT NULL,
  p_limit INT DEFAULT 25
)
RETURNS TABLE (
  codigo_inep TEXT,
  nome TEXT,
  municipio TEXT,
  uf TEXT,
  rede TEXT,
  score REAL
)
LANGUAGE SQL STABLE AS $$
  WITH q AS (
    SELECT trim(lower(public.f_unaccent(p_termo))) AS termo_norm
  )
  SELECT e.codigo_inep::TEXT, e.nome, e.municipio, e.uf, e.rede::TEXT,
    similarity(lower(public.f_unaccent(e.nome)), (SELECT termo_norm FROM q))::REAL AS score
  FROM diag_escolas e
  WHERE (p_uf IS NULL OR e.uf = p_uf)
    AND (
      -- Cada token (palavra de 2+ chars) deve aparecer no nome normalizado,
      -- em qualquer ordem. Tokens com 1 char são ignorados.
      SELECT bool_and(lower(public.f_unaccent(e.nome)) LIKE '%' || tk || '%')
      FROM unnest(regexp_split_to_array((SELECT termo_norm FROM q), '\s+')) AS tk
      WHERE length(tk) >= 2
    )
  ORDER BY score DESC NULLS LAST, e.nome ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION diag_buscar_escolas(TEXT, TEXT, INT) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────
-- RPC: busca de municípios (DISTINCT por IBGE, tokens AND)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION diag_buscar_municipios(
  p_termo TEXT,
  p_uf TEXT DEFAULT NULL,
  p_limit INT DEFAULT 60
)
RETURNS TABLE (
  municipio_ibge TEXT,
  municipio TEXT,
  uf TEXT,
  score REAL
)
LANGUAGE SQL STABLE AS $$
  WITH q AS (
    SELECT trim(lower(public.f_unaccent(p_termo))) AS termo_norm
  ),
  candidatos AS (
    SELECT DISTINCT ON (e.municipio_ibge)
      e.municipio_ibge::TEXT AS municipio_ibge,
      e.municipio,
      e.uf,
      similarity(lower(public.f_unaccent(e.municipio)), (SELECT termo_norm FROM q))::REAL AS score
    FROM diag_escolas e
    WHERE e.municipio_ibge IS NOT NULL
      AND (p_uf IS NULL OR e.uf = p_uf)
      AND (
        SELECT bool_and(lower(public.f_unaccent(e.municipio)) LIKE '%' || tk || '%')
        FROM unnest(regexp_split_to_array((SELECT termo_norm FROM q), '\s+')) AS tk
        WHERE length(tk) >= 2
      )
    ORDER BY e.municipio_ibge, score DESC NULLS LAST
  )
  SELECT c.municipio_ibge, c.municipio, c.uf, c.score
  FROM candidatos c
  ORDER BY c.score DESC NULLS LAST, c.municipio ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION diag_buscar_municipios(TEXT, TEXT, INT) TO anon, authenticated, service_role;
