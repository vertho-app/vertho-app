-- ═════════════════════════════════════════════════════════════════
-- Migration 075 — Stats agregadas por etapa em um município
-- Função RPC pra computar média, desvio-padrão, min/max de Saeb e Ideb
-- entre as escolas de um município, em uma etapa específica.
-- Usada no card "Variabilidade da rede" da página do município.
-- ═════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS diag_municipio_stats_etapa(TEXT, TEXT);

CREATE FUNCTION diag_municipio_stats_etapa(p_ibge TEXT, p_etapa TEXT)
RETURNS TABLE (
  qtd_escolas       INTEGER,
  saeb_lp_avg       NUMERIC,
  saeb_lp_stddev    NUMERIC,
  saeb_lp_min       NUMERIC,
  saeb_lp_max       NUMERIC,
  saeb_mat_avg      NUMERIC,
  saeb_mat_stddev   NUMERIC,
  saeb_mat_min      NUMERIC,
  saeb_mat_max      NUMERIC,
  ideb_avg          NUMERIC,
  ideb_stddev       NUMERIC
) AS $$
  WITH escolas AS (
    SELECT m.* FROM diag_mv_escola_metricas m
    JOIN diag_escolas e USING (codigo_inep)
    WHERE e.municipio_ibge = p_ibge
  ),
  lp AS (
    SELECT
      CASE p_etapa WHEN '5_EF' THEN saeb_5ef_lp WHEN '9_EF' THEN saeb_9ef_lp WHEN '3_EM' THEN saeb_3em_lp END AS v
    FROM escolas
  ),
  mat AS (
    SELECT
      CASE p_etapa WHEN '5_EF' THEN saeb_5ef_mat WHEN '9_EF' THEN saeb_9ef_mat WHEN '3_EM' THEN saeb_3em_mat END AS v
    FROM escolas
  ),
  ideb AS (
    SELECT
      CASE p_etapa WHEN '5_EF' THEN ideb_5ef WHEN '9_EF' THEN ideb_9ef WHEN '3_EM' THEN ideb_3em END AS v
    FROM escolas
  )
  SELECT
    (SELECT COUNT(*) FROM escolas WHERE
      (CASE p_etapa WHEN '5_EF' THEN saeb_5ef_lp WHEN '9_EF' THEN saeb_9ef_lp WHEN '3_EM' THEN saeb_3em_lp END) IS NOT NULL
      OR (CASE p_etapa WHEN '5_EF' THEN saeb_5ef_mat WHEN '9_EF' THEN saeb_9ef_mat WHEN '3_EM' THEN saeb_3em_mat END) IS NOT NULL
    )::INTEGER AS qtd_escolas,
    (SELECT AVG(v)::NUMERIC FROM lp WHERE v IS NOT NULL) AS saeb_lp_avg,
    (SELECT STDDEV_SAMP(v)::NUMERIC FROM lp WHERE v IS NOT NULL) AS saeb_lp_stddev,
    (SELECT MIN(v)::NUMERIC FROM lp WHERE v IS NOT NULL) AS saeb_lp_min,
    (SELECT MAX(v)::NUMERIC FROM lp WHERE v IS NOT NULL) AS saeb_lp_max,
    (SELECT AVG(v)::NUMERIC FROM mat WHERE v IS NOT NULL) AS saeb_mat_avg,
    (SELECT STDDEV_SAMP(v)::NUMERIC FROM mat WHERE v IS NOT NULL) AS saeb_mat_stddev,
    (SELECT MIN(v)::NUMERIC FROM mat WHERE v IS NOT NULL) AS saeb_mat_min,
    (SELECT MAX(v)::NUMERIC FROM mat WHERE v IS NOT NULL) AS saeb_mat_max,
    (SELECT AVG(v)::NUMERIC FROM ideb WHERE v IS NOT NULL) AS ideb_avg,
    (SELECT STDDEV_SAMP(v)::NUMERIC FROM ideb WHERE v IS NOT NULL) AS ideb_stddev;
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION diag_municipio_stats_etapa(TEXT, TEXT) TO anon, authenticated, service_role;
