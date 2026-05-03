-- ═════════════════════════════════════════════════════════════════
-- Migration 083 — Métricas de município filtradas pela rede MUNICIPAL
--
-- A MV diag_mv_municipio_metricas (mig 070) agrega TODAS as redes do
-- município (privada, estadual, municipal, federal). Isso prejudica a
-- narrativa em municípios com forte rede privada (ex: Ribeirão Preto)
-- onde o Ideb/Saeb agregado fica enviesado por escolas que o gestor
-- municipal não controla.
--
-- Esta MV espelha a 070, mas com filtro estrito de rede MUNICIPAL —
-- comparando apenas o que o município efetivamente gere. Útil para o
-- glimpse radarbett de município (público-alvo: gestor de rede).
--
-- A MV original (070) continua existindo e é usada pelas páginas do
-- radar oficial, que mostra a foto completa.
-- ═════════════════════════════════════════════════════════════════

DROP MATERIALIZED VIEW IF EXISTS diag_mv_municipio_metricas_municipal;

CREATE MATERIALIZED VIEW diag_mv_municipio_metricas_municipal AS
WITH municipios AS (
  -- Apenas municípios que TÊM rede municipal cadastrada
  SELECT DISTINCT e.municipio_ibge, e.uf, e.microrregiao
  FROM diag_escolas e
  WHERE e.municipio_ibge IS NOT NULL AND e.rede = 'MUNICIPAL'
),
ica_recent AS (
  SELECT DISTINCT ON (municipio_ibge)
    municipio_ibge, taxa AS ica_taxa, ano AS ica_ano
  FROM diag_ica_snapshots
  WHERE taxa IS NOT NULL AND taxa > 0 AND rede = 'MUNICIPAL'
  ORDER BY municipio_ibge, ano DESC
),
ideb_mun AS (
  SELECT
    e.municipio_ibge,
    AVG(CASE WHEN s.etapa = '5_EF' THEN s.ideb END) AS ideb_5ef,
    AVG(CASE WHEN s.etapa = '9_EF' THEN s.ideb END) AS ideb_9ef,
    AVG(CASE WHEN s.etapa = '3_EM' THEN s.ideb END) AS ideb_3em,
    MAX(s.ano) AS ideb_ano,
    COUNT(DISTINCT e.codigo_inep) AS escolas_consideradas
  FROM diag_ideb_snapshots s
  JOIN diag_escolas e ON e.codigo_inep = s.codigo_inep
  WHERE s.ideb IS NOT NULL
    AND e.rede = 'MUNICIPAL'
    AND s.ano = (SELECT MAX(ano) FROM diag_ideb_snapshots)
  GROUP BY e.municipio_ibge
),
saeb_mun AS (
  SELECT
    e.municipio_ibge,
    AVG(CASE WHEN s.etapa = '5_EF' AND s.disciplina = 'LP'  THEN s.media_proficiencia END) AS saeb_5ef_lp,
    AVG(CASE WHEN s.etapa = '5_EF' AND s.disciplina = 'MAT' THEN s.media_proficiencia END) AS saeb_5ef_mat,
    AVG(CASE WHEN s.etapa = '9_EF' AND s.disciplina = 'LP'  THEN s.media_proficiencia END) AS saeb_9ef_lp,
    AVG(CASE WHEN s.etapa = '9_EF' AND s.disciplina = 'MAT' THEN s.media_proficiencia END) AS saeb_9ef_mat,
    MAX(s.ano) AS saeb_ano
  FROM diag_saeb_snapshots s
  JOIN diag_escolas e ON e.codigo_inep = s.codigo_inep
  WHERE s.media_proficiencia IS NOT NULL
    AND e.rede = 'MUNICIPAL'
    AND s.ano = (SELECT MAX(ano) FROM diag_saeb_snapshots)
  GROUP BY e.municipio_ibge
),
enem_mun AS (
  -- ENEM agregado da rede municipal (peso por participantes_com_media_geral
  -- nas escolas com 10+ participantes — corte público INEP).
  SELECT
    municipio_ibge,
    SUM(media_geral * participantes_com_media_geral)
      / NULLIF(SUM(participantes_com_media_geral), 0) AS enem_media_geral,
    MAX(ano) AS enem_ano,
    COUNT(DISTINCT codigo_inep) AS escolas_enem
  FROM diag_enem_escola_snapshots
  WHERE media_geral IS NOT NULL
    AND participantes_total >= 10
    AND dependencia_adm = 'MUNICIPAL'
    AND ano = (SELECT MAX(ano) FROM diag_enem_escola_snapshots WHERE media_geral IS NOT NULL)
  GROUP BY municipio_ibge
),
fundeb_recent AS (
  -- FUNDEB é municipal por natureza (mesmo dado da 070)
  SELECT DISTINCT ON (municipio_ibge)
    municipio_ibge, valor_aluno_ano AS fundeb_aluno, ano AS fundeb_ano
  FROM diag_fundeb_repasses
  WHERE valor_aluno_ano IS NOT NULL AND valor_aluno_ano > 0
  ORDER BY municipio_ibge, ano DESC
)
SELECT
  m.municipio_ibge,
  m.uf,
  m.microrregiao,
  i.ica_taxa,
  i.ica_ano,
  d.ideb_5ef,
  d.ideb_9ef,
  d.ideb_3em,
  d.ideb_ano,
  d.escolas_consideradas AS ideb_escolas,
  s.saeb_5ef_lp,
  s.saeb_5ef_mat,
  s.saeb_9ef_lp,
  s.saeb_9ef_mat,
  s.saeb_ano,
  e.enem_media_geral,
  e.enem_ano,
  e.escolas_enem,
  f.fundeb_aluno,
  f.fundeb_ano
FROM municipios m
LEFT JOIN ica_recent     i ON i.municipio_ibge = m.municipio_ibge
LEFT JOIN ideb_mun       d ON d.municipio_ibge = m.municipio_ibge
LEFT JOIN saeb_mun       s ON s.municipio_ibge = m.municipio_ibge
LEFT JOIN enem_mun       e ON e.municipio_ibge = m.municipio_ibge
LEFT JOIN fundeb_recent  f ON f.municipio_ibge = m.municipio_ibge;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_mun_metr_municipal_pk
  ON diag_mv_municipio_metricas_municipal(municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_diag_mv_mun_metr_municipal_uf
  ON diag_mv_municipio_metricas_municipal(uf);
CREATE INDEX IF NOT EXISTS idx_diag_mv_mun_metr_municipal_micro
  ON diag_mv_municipio_metricas_municipal(uf, microrregiao);

GRANT SELECT ON diag_mv_municipio_metricas_municipal TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────
-- RPC: benchmarks da rede municipal (cidade, microrregião, UF, BR)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION diag_municipio_benchmarks_municipal(p_ibge TEXT)
RETURNS TABLE (
  scope            TEXT,
  ica_taxa         NUMERIC,
  ideb_5ef         NUMERIC,
  ideb_9ef         NUMERIC,
  ideb_3em         NUMERIC,
  saeb_5ef_lp      NUMERIC,
  saeb_5ef_mat     NUMERIC,
  saeb_9ef_lp      NUMERIC,
  saeb_9ef_mat     NUMERIC,
  enem_media_geral NUMERIC,
  fundeb_aluno     NUMERIC,
  qtd_munis        INTEGER
) AS $$
  WITH alvo AS (
    SELECT * FROM diag_mv_municipio_metricas_municipal WHERE municipio_ibge = p_ibge
  )
  SELECT 'cidade' AS scope,
    a.ica_taxa, a.ideb_5ef, a.ideb_9ef, a.ideb_3em,
    a.saeb_5ef_lp, a.saeb_5ef_mat, a.saeb_9ef_lp, a.saeb_9ef_mat,
    a.enem_media_geral, a.fundeb_aluno, 1
  FROM alvo a
  UNION ALL
  SELECT 'microrregiao',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC,
    AVG(m.ideb_9ef)::NUMERIC,
    AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC,
    AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC,
    AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.enem_media_geral)::NUMERIC,
    AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas_municipal m
  JOIN alvo a ON m.uf = a.uf AND m.microrregiao = (SELECT microrregiao FROM diag_mv_municipio_metricas_municipal WHERE municipio_ibge = p_ibge)
  UNION ALL
  SELECT 'estado',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC,
    AVG(m.ideb_9ef)::NUMERIC,
    AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC,
    AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC,
    AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.enem_media_geral)::NUMERIC,
    AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas_municipal m
  WHERE m.uf = (SELECT uf FROM diag_mv_municipio_metricas_municipal WHERE municipio_ibge = p_ibge)
  UNION ALL
  SELECT 'brasil',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC,
    AVG(m.ideb_9ef)::NUMERIC,
    AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC,
    AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC,
    AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.enem_media_geral)::NUMERIC,
    AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas_municipal m;
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION diag_municipio_benchmarks_municipal(TEXT) TO anon, authenticated, service_role;

-- Adiciona a nova MV ao refresh helper para que rode junto das demais
CREATE OR REPLACE FUNCTION refresh_diag_mvs()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_escola_saeb_agg;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_saeb_agg;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_ica_recent;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_estado_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_metricas;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_metricas_municipal;
EXCEPTION
  WHEN feature_not_supported THEN
    -- fallback: refresh sem CONCURRENTLY se algum índice único faltar
    REFRESH MATERIALIZED VIEW diag_mv_escola_saeb_agg;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_saeb_agg;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_ica_recent;
    REFRESH MATERIALIZED VIEW diag_mv_estado_stats;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_metricas;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_metricas_municipal;
END $$;

GRANT EXECUTE ON FUNCTION refresh_diag_mvs() TO anon, authenticated, service_role;

-- Refresh inicial para popular a MV
REFRESH MATERIALIZED VIEW diag_mv_municipio_metricas_municipal;
