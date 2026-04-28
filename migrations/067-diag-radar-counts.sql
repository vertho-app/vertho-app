-- Migration 067 — contadores agregados do Radar
-- Evita COUNT(*) repetido nas tabelas grandes a cada carregamento
-- da home pública e do painel admin.

CREATE MATERIALIZED VIEW IF NOT EXISTS diag_mv_radar_counts AS
SELECT
  1 AS singleton_key,
  (SELECT COUNT(*) FROM diag_escolas) AS escolas,
  (
    SELECT COUNT(DISTINCT municipio_ibge)
    FROM diag_escolas
    WHERE municipio_ibge IS NOT NULL
  ) AS municipios,
  (SELECT COUNT(*) FROM diag_saeb_snapshots) AS saeb_snapshots,
  (SELECT COUNT(*) FROM diag_ica_snapshots) AS ica_snapshots,
  (SELECT COUNT(*) FROM diag_ideb_snapshots) AS ideb_snapshots,
  (SELECT COUNT(*) FROM diag_saresp_snapshots) AS saresp_snapshots,
  (SELECT COUNT(*) FROM diag_fundeb_repasses) AS fundeb_repasses,
  (SELECT COUNT(*) FROM diag_pdde_repasses) AS pdde_escola,
  (SELECT COUNT(*) FROM diag_pdde_municipal) AS pdde_municipal,
  now() AS atualizado_em;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_radar_counts_singleton
  ON diag_mv_radar_counts(singleton_key);

GRANT SELECT ON diag_mv_radar_counts TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION refresh_diag_mvs()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_escola_saeb_agg;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_saeb_agg;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_ica_recent;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_estado_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_radar_counts;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_diag_mvs() TO authenticated, service_role;
