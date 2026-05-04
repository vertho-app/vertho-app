-- ═════════════════════════════════════════════════════════════════
-- Migration 085 — Busca avançada de escolas (UF, rede, etapa, nome)
--
-- Estende a infraestrutura da mig 084 com função para a página de
-- busca avançada do radarbett (/radarbett/buscar):
--  - Filtros independentes (todos opcionais): termo, uf, rede, etapa,
--    municipio_ibge
--  - Paginação por limit/offset
--  - Função separada para contagem total (paginação)
--  - Quando termo vazio → ordena por nome; com termo → por similaridade
-- ═════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION diag_buscar_escolas_avancado(
  p_termo TEXT DEFAULT NULL,
  p_uf TEXT DEFAULT NULL,
  p_municipio_ibge TEXT DEFAULT NULL,
  p_rede TEXT DEFAULT NULL,
  p_etapa TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  codigo_inep TEXT,
  nome TEXT,
  municipio TEXT,
  municipio_ibge TEXT,
  uf TEXT,
  rede TEXT,
  etapas TEXT[],
  inse_grupo INT,
  score REAL
)
LANGUAGE SQL STABLE AS $$
  WITH q AS (
    SELECT
      trim(lower(public.f_unaccent(coalesce(p_termo, '')))) AS termo_norm,
      coalesce(p_termo, '') = '' OR trim(p_termo) = '' AS sem_termo
  )
  SELECT
    e.codigo_inep::TEXT,
    e.nome,
    e.municipio,
    e.municipio_ibge::TEXT,
    e.uf,
    e.rede::TEXT,
    e.etapas::TEXT[],
    e.inse_grupo,
    CASE
      WHEN (SELECT sem_termo FROM q) THEN 0::REAL
      ELSE similarity(lower(public.f_unaccent(e.nome)), (SELECT termo_norm FROM q))::REAL
    END AS score
  FROM diag_escolas e
  WHERE (p_uf IS NULL OR e.uf = p_uf)
    AND (p_municipio_ibge IS NULL OR e.municipio_ibge = p_municipio_ibge)
    AND (p_rede IS NULL OR e.rede = p_rede)
    AND (p_etapa IS NULL OR e.etapas && ARRAY[p_etapa])
    AND (
      (SELECT sem_termo FROM q)
      OR (
        SELECT bool_and(lower(public.f_unaccent(e.nome)) LIKE '%' || tk || '%')
        FROM unnest(regexp_split_to_array((SELECT termo_norm FROM q), '\s+')) AS tk
        WHERE length(tk) >= 2
      )
    )
  ORDER BY
    CASE WHEN (SELECT sem_termo FROM q) THEN 0 ELSE 1 END DESC,
    score DESC NULLS LAST,
    e.nome ASC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION diag_buscar_escolas_avancado(TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT) TO anon, authenticated, service_role;

-- Função separada para contagem total (paginação)
CREATE OR REPLACE FUNCTION diag_buscar_escolas_avancado_count(
  p_termo TEXT DEFAULT NULL,
  p_uf TEXT DEFAULT NULL,
  p_municipio_ibge TEXT DEFAULT NULL,
  p_rede TEXT DEFAULT NULL,
  p_etapa TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE SQL STABLE AS $$
  WITH q AS (
    SELECT
      trim(lower(public.f_unaccent(coalesce(p_termo, '')))) AS termo_norm,
      coalesce(p_termo, '') = '' OR trim(p_termo) = '' AS sem_termo
  )
  SELECT COUNT(*)::INT
  FROM diag_escolas e
  WHERE (p_uf IS NULL OR e.uf = p_uf)
    AND (p_municipio_ibge IS NULL OR e.municipio_ibge = p_municipio_ibge)
    AND (p_rede IS NULL OR e.rede = p_rede)
    AND (p_etapa IS NULL OR e.etapas && ARRAY[p_etapa])
    AND (
      (SELECT sem_termo FROM q)
      OR (
        SELECT bool_and(lower(public.f_unaccent(e.nome)) LIKE '%' || tk || '%')
        FROM unnest(regexp_split_to_array((SELECT termo_norm FROM q), '\s+')) AS tk
        WHERE length(tk) >= 2
      )
    );
$$;

GRANT EXECUTE ON FUNCTION diag_buscar_escolas_avancado_count(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
