-- Migration 060 — Materialized Views para rankings/agregações
-- Em escala (>5k escolas) o cálculo no Node fica caro. MVs pré-computam
-- e dão SELECT O(1). Refresh manual ou via cron após ingestão.

-- ── 1. Saeb agregado por escola (último ano disponível) ─────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS diag_mv_escola_saeb_agg AS
SELECT
  s.codigo_inep,
  MAX(s.ano)                                AS ano_referencia,
  AVG(
    COALESCE((s.distribuicao->>'0')::numeric, 0) +
    COALESCE((s.distribuicao->>'1')::numeric, 0)
  )                                         AS pct_n01_avg,
  AVG(s.taxa_participacao)                  AS taxa_participacao_avg,
  AVG(s.formacao_docente)                   AS formacao_docente_avg
FROM diag_saeb_snapshots s
GROUP BY s.codigo_inep;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_escola_saeb_inep
  ON diag_mv_escola_saeb_agg(codigo_inep);

-- ── 2. Saeb agregado por município ──────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS diag_mv_municipio_saeb_agg AS
SELECT
  e.municipio_ibge,
  e.uf,
  MAX(e.municipio)                          AS municipio_nome,
  COUNT(DISTINCT e.codigo_inep)             AS total_escolas,
  COUNT(s.codigo_inep)                      AS total_snapshots,
  AVG(esa.pct_n01_avg)                      AS pct_n01_avg,
  AVG(esa.taxa_participacao_avg)            AS taxa_participacao_avg,
  AVG(esa.formacao_docente_avg)             AS formacao_docente_avg
FROM diag_escolas e
LEFT JOIN diag_mv_escola_saeb_agg esa ON esa.codigo_inep = e.codigo_inep
LEFT JOIN diag_saeb_snapshots s ON s.codigo_inep = e.codigo_inep
WHERE e.municipio_ibge IS NOT NULL
GROUP BY e.municipio_ibge, e.uf;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_municipio_saeb_ibge
  ON diag_mv_municipio_saeb_agg(municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_diag_mv_municipio_saeb_uf
  ON diag_mv_municipio_saeb_agg(uf);

-- ── 3. ICA mais recente por município ───────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS diag_mv_municipio_ica_recent AS
SELECT DISTINCT ON (municipio_ibge)
  municipio_ibge,
  uf,
  ano,
  rede,
  taxa,
  total_estado,
  total_brasil
FROM diag_ica_snapshots
WHERE rede = 'MUNICIPAL' OR rede = 'TOTAL'
ORDER BY municipio_ibge, ano DESC,
  CASE rede WHEN 'MUNICIPAL' THEN 1 WHEN 'TOTAL' THEN 2 ELSE 3 END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_municipio_ica_ibge
  ON diag_mv_municipio_ica_recent(municipio_ibge);

-- ── 4. Stats por UF ─────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS diag_mv_estado_stats AS
SELECT
  e.uf,
  COUNT(DISTINCT e.codigo_inep)                      AS total_escolas,
  COUNT(DISTINCT e.municipio_ibge)
    FILTER (WHERE e.municipio_ibge IS NOT NULL)      AS total_municipios,
  (SELECT COUNT(*) FROM diag_saeb_snapshots s
    JOIN diag_escolas e2 ON e2.codigo_inep = s.codigo_inep
    WHERE e2.uf = e.uf)                              AS total_snapshots,
  MAX(e.atualizado_em)                                AS atualizado_em
FROM diag_escolas e
WHERE e.uf IS NOT NULL
GROUP BY e.uf;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_estado_stats_uf
  ON diag_mv_estado_stats(uf);

-- ── 5. RPC pra refresh CONCURRENTLY (pode ser chamado por cron) ─────
CREATE OR REPLACE FUNCTION refresh_diag_mvs()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_escola_saeb_agg;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_saeb_agg;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_ica_recent;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_estado_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_diag_mvs() TO authenticated, service_role;

-- ── 6. RPC para count distinct de municípios (home stats) ───────────
CREATE OR REPLACE FUNCTION diag_count_municipios_distintos()
RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT COUNT(DISTINCT municipio_ibge)
  FROM diag_escolas
  WHERE municipio_ibge IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION diag_count_municipios_distintos() TO authenticated, anon, service_role;
