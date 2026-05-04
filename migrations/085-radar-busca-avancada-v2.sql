-- Atualiza filtro de etapa: fallback via snapshots Saeb/ENEM
-- (apenas 1/3 das escolas têm `etapas` no Censo populado).

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
    AND (
      p_etapa IS NULL
      OR e.etapas && ARRAY[p_etapa]
      OR EXISTS (
        SELECT 1 FROM diag_saeb_snapshots s
        WHERE s.codigo_inep = e.codigo_inep AND s.etapa = p_etapa
      )
      OR (p_etapa = '3_EM' AND EXISTS (
        SELECT 1 FROM diag_enem_escola_snapshots en
        WHERE en.codigo_inep = e.codigo_inep
      ))
    )
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
    AND (
      p_etapa IS NULL
      OR e.etapas && ARRAY[p_etapa]
      OR EXISTS (
        SELECT 1 FROM diag_saeb_snapshots s
        WHERE s.codigo_inep = e.codigo_inep AND s.etapa = p_etapa
      )
      OR (p_etapa = '3_EM' AND EXISTS (
        SELECT 1 FROM diag_enem_escola_snapshots en
        WHERE en.codigo_inep = e.codigo_inep
      ))
    )
    AND (
      (SELECT sem_termo FROM q)
      OR (
        SELECT bool_and(lower(public.f_unaccent(e.nome)) LIKE '%' || tk || '%')
        FROM unnest(regexp_split_to_array((SELECT termo_norm FROM q), '\s+')) AS tk
        WHERE length(tk) >= 2
      )
    );
$$;
