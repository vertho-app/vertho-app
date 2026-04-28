-- ═════════════════════════════════════════════════════════════════
-- Migration 072 — Benchmarks de escola filtrados por INSE
-- Adiciona inse_grupo na MV de métricas e filtra a média da
-- microrregião/estado para incluir apenas escolas com o mesmo grupo
-- INSE da escola-alvo (comparação socioeconomicamente justa).
-- Fallback: se a escola não tiver INSE, ignora o filtro.
-- ═════════════════════════════════════════════════════════════════

DROP MATERIALIZED VIEW IF EXISTS diag_mv_escola_metricas;

CREATE MATERIALIZED VIEW diag_mv_escola_metricas AS
WITH ideb_esc AS (
  SELECT
    codigo_inep,
    AVG(CASE WHEN etapa = '5_EF' THEN ideb END) AS ideb_5ef,
    AVG(CASE WHEN etapa = '9_EF' THEN ideb END) AS ideb_9ef,
    AVG(CASE WHEN etapa = '3_EM' THEN ideb END) AS ideb_3em,
    MAX(ano) AS ideb_ano
  FROM diag_ideb_snapshots
  WHERE ideb IS NOT NULL AND ano = (SELECT MAX(ano) FROM diag_ideb_snapshots)
  GROUP BY codigo_inep
),
saeb_esc AS (
  SELECT
    codigo_inep,
    AVG(CASE WHEN etapa = '5_EF' AND disciplina = 'LP'  THEN media_proficiencia END) AS saeb_5ef_lp,
    AVG(CASE WHEN etapa = '5_EF' AND disciplina = 'MAT' THEN media_proficiencia END) AS saeb_5ef_mat,
    AVG(CASE WHEN etapa = '9_EF' AND disciplina = 'LP'  THEN media_proficiencia END) AS saeb_9ef_lp,
    AVG(CASE WHEN etapa = '9_EF' AND disciplina = 'MAT' THEN media_proficiencia END) AS saeb_9ef_mat,
    AVG(CASE WHEN etapa = '3_EM' AND disciplina = 'LP'  THEN media_proficiencia END) AS saeb_3em_lp,
    AVG(CASE WHEN etapa = '3_EM' AND disciplina = 'MAT' THEN media_proficiencia END) AS saeb_3em_mat,
    MAX(ano) AS saeb_ano
  FROM diag_saeb_snapshots
  WHERE media_proficiencia IS NOT NULL
    AND ano = (SELECT MAX(ano) FROM diag_saeb_snapshots)
  GROUP BY codigo_inep
)
SELECT
  e.codigo_inep,
  e.uf,
  e.microrregiao,
  e.municipio_ibge,
  e.rede,
  e.inse_grupo,
  d.ideb_5ef, d.ideb_9ef, d.ideb_3em, d.ideb_ano,
  s.saeb_5ef_lp, s.saeb_5ef_mat,
  s.saeb_9ef_lp, s.saeb_9ef_mat,
  s.saeb_3em_lp, s.saeb_3em_mat,
  s.saeb_ano
FROM diag_escolas e
LEFT JOIN ideb_esc d ON d.codigo_inep = e.codigo_inep
LEFT JOIN saeb_esc s ON s.codigo_inep = e.codigo_inep
WHERE e.codigo_inep IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_esc_metricas_pk
  ON diag_mv_escola_metricas(codigo_inep);
CREATE INDEX IF NOT EXISTS idx_diag_mv_esc_metricas_uf
  ON diag_mv_escola_metricas(uf);
CREATE INDEX IF NOT EXISTS idx_diag_mv_esc_metricas_micro
  ON diag_mv_escola_metricas(uf, microrregiao);
CREATE INDEX IF NOT EXISTS idx_diag_mv_esc_metricas_inse
  ON diag_mv_escola_metricas(uf, inse_grupo);

GRANT SELECT ON diag_mv_escola_metricas TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────
-- RPC com filtro por INSE Grupo
-- Se a escola-alvo não tem INSE, retorna a média sem filtro
-- (e qtd_escolas reflete isso). Caso contrário, só escolas do mesmo
-- inse_grupo entram na média.
-- ─────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS diag_escola_benchmarks(TEXT);

CREATE FUNCTION diag_escola_benchmarks(p_inep TEXT)
RETURNS TABLE (
  scope         TEXT,
  ideb_5ef      NUMERIC,
  ideb_9ef      NUMERIC,
  ideb_3em      NUMERIC,
  saeb_5ef_lp   NUMERIC,
  saeb_5ef_mat  NUMERIC,
  saeb_9ef_lp   NUMERIC,
  saeb_9ef_mat  NUMERIC,
  saeb_3em_lp   NUMERIC,
  saeb_3em_mat  NUMERIC,
  qtd_escolas   INTEGER,
  inse_grupo    SMALLINT
) AS $$
  WITH alvo AS (
    SELECT * FROM diag_mv_escola_metricas WHERE codigo_inep = p_inep
  )
  SELECT 'escola' AS scope,
    a.ideb_5ef, a.ideb_9ef, a.ideb_3em,
    a.saeb_5ef_lp, a.saeb_5ef_mat,
    a.saeb_9ef_lp, a.saeb_9ef_mat,
    a.saeb_3em_lp, a.saeb_3em_mat,
    1, a.inse_grupo
  FROM alvo a
  UNION ALL
  SELECT 'microrregiao',
    AVG(m.ideb_5ef)::NUMERIC, AVG(m.ideb_9ef)::NUMERIC, AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC, AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC, AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.saeb_3em_lp)::NUMERIC, AVG(m.saeb_3em_mat)::NUMERIC,
    COUNT(*)::INTEGER, (SELECT inse_grupo FROM alvo)
  FROM diag_mv_escola_metricas m
  JOIN alvo a ON m.uf = a.uf AND m.microrregiao = a.microrregiao
  WHERE m.codigo_inep <> p_inep
    AND (a.inse_grupo IS NULL OR m.inse_grupo = a.inse_grupo)
  UNION ALL
  SELECT 'estado',
    AVG(m.ideb_5ef)::NUMERIC, AVG(m.ideb_9ef)::NUMERIC, AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC, AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC, AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.saeb_3em_lp)::NUMERIC, AVG(m.saeb_3em_mat)::NUMERIC,
    COUNT(*)::INTEGER, (SELECT inse_grupo FROM alvo)
  FROM diag_mv_escola_metricas m
  JOIN alvo a ON m.uf = a.uf
  WHERE m.codigo_inep <> p_inep
    AND (a.inse_grupo IS NULL OR m.inse_grupo = a.inse_grupo);
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION diag_escola_benchmarks(TEXT) TO anon, authenticated, service_role;
