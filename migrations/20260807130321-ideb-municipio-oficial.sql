-- IDEB municipal oficial: separa o agregado publicado pelo Inep da média das escolas.
--
-- `diag_ideb_snapshots` já suporta escopo=municipio. Esta migration faz as MVs
-- consumirem a linha oficial PUBLICA/MUNICIPAL e mantém as linhas de escola apenas
-- para detalhe, dispersão e contagem de cobertura.

CREATE INDEX IF NOT EXISTS idx_diag_ideb_municipio_oficial_recente
  ON diag_ideb_snapshots (rede, ano DESC, etapa, municipio_ibge)
  WHERE escopo = 'municipio' AND ideb IS NOT NULL;

DROP FUNCTION IF EXISTS diag_municipio_benchmarks(TEXT);
DROP FUNCTION IF EXISTS diag_municipio_benchmarks_municipal(TEXT);
DROP MATERIALIZED VIEW IF EXISTS diag_mv_municipio_metricas;
DROP MATERIALIZED VIEW IF EXISTS diag_mv_municipio_metricas_municipal;

-- Foto da rede pública do município: usa a linha oficial `rede=PUBLICA` do Inep.
CREATE MATERIALIZED VIEW diag_mv_municipio_metricas AS
WITH municipios AS (
  SELECT DISTINCT municipio_ibge, uf, microrregiao
  FROM diag_escolas
  WHERE municipio_ibge IS NOT NULL
),
ica_recent AS (
  SELECT DISTINCT ON (municipio_ibge)
    municipio_ibge, taxa AS ica_taxa, ano AS ica_ano
  FROM diag_ica_snapshots
  WHERE taxa IS NOT NULL AND taxa > 0
  ORDER BY municipio_ibge, ano DESC
),
ideb_ano_recent AS (
  SELECT MAX(ano) AS ano
  FROM diag_ideb_snapshots
  WHERE escopo = 'municipio' AND rede = 'PUBLICA' AND ideb IS NOT NULL
),
ideb_mun AS (
  SELECT
    s.municipio_ibge,
    MAX(s.ideb) FILTER (WHERE s.etapa = '5_EF') AS ideb_5ef,
    MAX(s.ideb) FILTER (WHERE s.etapa = '9_EF') AS ideb_9ef,
    MAX(s.ideb) FILTER (WHERE s.etapa = '3_EM') AS ideb_3em,
    MAX(s.ano) AS ideb_ano
  FROM diag_ideb_snapshots s
  CROSS JOIN ideb_ano_recent a
  WHERE s.escopo = 'municipio'
    AND s.rede = 'PUBLICA'
    AND s.ideb IS NOT NULL
    AND s.ano = a.ano
  GROUP BY s.municipio_ibge
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
    AND s.ano = (SELECT MAX(ano) FROM diag_saeb_snapshots)
  GROUP BY e.municipio_ibge
),
fundeb_recent AS (
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
  s.saeb_5ef_lp,
  s.saeb_5ef_mat,
  s.saeb_9ef_lp,
  s.saeb_9ef_mat,
  s.saeb_ano,
  f.fundeb_aluno,
  f.fundeb_ano
FROM municipios m
LEFT JOIN ica_recent    i ON i.municipio_ibge = m.municipio_ibge
LEFT JOIN ideb_mun      d ON d.municipio_ibge = m.municipio_ibge
LEFT JOIN saeb_mun      s ON s.municipio_ibge = m.municipio_ibge
LEFT JOIN fundeb_recent f ON f.municipio_ibge = m.municipio_ibge;

CREATE UNIQUE INDEX idx_diag_mv_mun_metricas_pk
  ON diag_mv_municipio_metricas(municipio_ibge);
CREATE INDEX idx_diag_mv_mun_metricas_uf
  ON diag_mv_municipio_metricas(uf);
CREATE INDEX idx_diag_mv_mun_metricas_micro
  ON diag_mv_municipio_metricas(uf, microrregiao);

GRANT SELECT ON diag_mv_municipio_metricas TO anon, authenticated, service_role;

-- Recorte do gestor municipal: usa a linha oficial `rede=MUNICIPAL` do Inep.
CREATE MATERIALIZED VIEW diag_mv_municipio_metricas_municipal AS
WITH municipios AS (
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
ideb_ano_recent AS (
  SELECT MAX(ano) AS ano
  FROM diag_ideb_snapshots
  WHERE escopo = 'municipio' AND rede = 'MUNICIPAL' AND ideb IS NOT NULL
),
ideb_mun AS (
  SELECT
    s.municipio_ibge,
    MAX(s.ideb) FILTER (WHERE s.etapa = '5_EF') AS ideb_5ef,
    MAX(s.ideb) FILTER (WHERE s.etapa = '9_EF') AS ideb_9ef,
    MAX(s.ideb) FILTER (WHERE s.etapa = '3_EM') AS ideb_3em,
    MAX(s.ano) AS ideb_ano
  FROM diag_ideb_snapshots s
  CROSS JOIN ideb_ano_recent a
  WHERE s.escopo = 'municipio'
    AND s.rede = 'MUNICIPAL'
    AND s.ideb IS NOT NULL
    AND s.ano = a.ano
  GROUP BY s.municipio_ibge
),
ideb_cobertura AS (
  SELECT
    e.municipio_ibge,
    COUNT(DISTINCT e.codigo_inep) AS escolas_consideradas
  FROM diag_ideb_snapshots s
  JOIN diag_escolas e ON e.codigo_inep = s.codigo_inep
  CROSS JOIN ideb_ano_recent a
  WHERE s.escopo = 'escola'
    AND s.ideb IS NOT NULL
    AND e.rede = 'MUNICIPAL'
    AND s.ano = a.ano
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
  c.escolas_consideradas AS ideb_escolas,
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
LEFT JOIN ideb_cobertura c ON c.municipio_ibge = m.municipio_ibge
LEFT JOIN saeb_mun       s ON s.municipio_ibge = m.municipio_ibge
LEFT JOIN enem_mun       e ON e.municipio_ibge = m.municipio_ibge
LEFT JOIN fundeb_recent  f ON f.municipio_ibge = m.municipio_ibge;

CREATE UNIQUE INDEX idx_diag_mv_mun_metr_municipal_pk
  ON diag_mv_municipio_metricas_municipal(municipio_ibge);
CREATE INDEX idx_diag_mv_mun_metr_municipal_uf
  ON diag_mv_municipio_metricas_municipal(uf);
CREATE INDEX idx_diag_mv_mun_metr_municipal_micro
  ON diag_mv_municipio_metricas_municipal(uf, microrregiao);

GRANT SELECT ON diag_mv_municipio_metricas_municipal TO anon, authenticated, service_role;

CREATE FUNCTION diag_municipio_benchmarks(p_ibge TEXT)
RETURNS TABLE (
  scope TEXT,
  ica_taxa NUMERIC,
  ideb_5ef NUMERIC,
  ideb_9ef NUMERIC,
  ideb_3em NUMERIC,
  saeb_5ef_lp NUMERIC,
  saeb_5ef_mat NUMERIC,
  saeb_9ef_lp NUMERIC,
  saeb_9ef_mat NUMERIC,
  fundeb_aluno NUMERIC,
  qtd_munis INTEGER
) AS $$
  WITH alvo AS (
    SELECT * FROM diag_mv_municipio_metricas WHERE municipio_ibge = p_ibge
  )
  SELECT 'cidade',
    a.ica_taxa, a.ideb_5ef, a.ideb_9ef, a.ideb_3em,
    a.saeb_5ef_lp, a.saeb_5ef_mat, a.saeb_9ef_lp, a.saeb_9ef_mat,
    a.fundeb_aluno, 1
  FROM alvo a
  UNION ALL
  SELECT 'microrregiao',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC, AVG(m.ideb_9ef)::NUMERIC, AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC, AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC, AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas m
  JOIN alvo a ON m.uf = a.uf AND m.microrregiao = a.microrregiao
  UNION ALL
  SELECT 'estado',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC, AVG(m.ideb_9ef)::NUMERIC, AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC, AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC, AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas m
  WHERE m.uf = (SELECT uf FROM alvo)
  UNION ALL
  SELECT 'brasil',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC, AVG(m.ideb_9ef)::NUMERIC, AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC, AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC, AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas m;
$$ LANGUAGE SQL STABLE;

CREATE FUNCTION diag_municipio_benchmarks_municipal(p_ibge TEXT)
RETURNS TABLE (
  scope TEXT,
  ica_taxa NUMERIC,
  ideb_5ef NUMERIC,
  ideb_9ef NUMERIC,
  ideb_3em NUMERIC,
  saeb_5ef_lp NUMERIC,
  saeb_5ef_mat NUMERIC,
  saeb_9ef_lp NUMERIC,
  saeb_9ef_mat NUMERIC,
  enem_media_geral NUMERIC,
  fundeb_aluno NUMERIC,
  qtd_munis INTEGER
) AS $$
  WITH alvo AS (
    SELECT * FROM diag_mv_municipio_metricas_municipal WHERE municipio_ibge = p_ibge
  )
  SELECT 'cidade',
    a.ica_taxa, a.ideb_5ef, a.ideb_9ef, a.ideb_3em,
    a.saeb_5ef_lp, a.saeb_5ef_mat, a.saeb_9ef_lp, a.saeb_9ef_mat,
    a.enem_media_geral, a.fundeb_aluno, 1
  FROM alvo a
  UNION ALL
  SELECT 'microrregiao',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC, AVG(m.ideb_9ef)::NUMERIC, AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC, AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC, AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.enem_media_geral)::NUMERIC, AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas_municipal m
  JOIN alvo a ON m.uf = a.uf AND m.microrregiao = a.microrregiao
  UNION ALL
  SELECT 'estado',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC, AVG(m.ideb_9ef)::NUMERIC, AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC, AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC, AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.enem_media_geral)::NUMERIC, AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas_municipal m
  WHERE m.uf = (SELECT uf FROM alvo)
  UNION ALL
  SELECT 'brasil',
    AVG(m.ica_taxa)::NUMERIC,
    AVG(m.ideb_5ef)::NUMERIC, AVG(m.ideb_9ef)::NUMERIC, AVG(m.ideb_3em)::NUMERIC,
    AVG(m.saeb_5ef_lp)::NUMERIC, AVG(m.saeb_5ef_mat)::NUMERIC,
    AVG(m.saeb_9ef_lp)::NUMERIC, AVG(m.saeb_9ef_mat)::NUMERIC,
    AVG(m.enem_media_geral)::NUMERIC, AVG(m.fundeb_aluno)::NUMERIC,
    COUNT(DISTINCT m.municipio_ibge)::INTEGER
  FROM diag_mv_municipio_metricas_municipal m;
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION diag_municipio_benchmarks(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION diag_municipio_benchmarks_municipal(TEXT) TO anon, authenticated, service_role;

-- Consolida a definição mais recente do helper, incluindo todas as MVs do Radar.
CREATE OR REPLACE FUNCTION refresh_diag_mvs()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_escola_saeb_agg;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_saeb_agg;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_ica_recent;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_estado_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_radar_counts;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_metricas;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_municipio_metricas_municipal;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_escola_metricas;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_escola_infra_saeb;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_docentes_agg;
EXCEPTION
  WHEN feature_not_supported THEN
    REFRESH MATERIALIZED VIEW diag_mv_escola_saeb_agg;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_saeb_agg;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_ica_recent;
    REFRESH MATERIALIZED VIEW diag_mv_estado_stats;
    REFRESH MATERIALIZED VIEW diag_mv_radar_counts;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_metricas;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_metricas_municipal;
    REFRESH MATERIALIZED VIEW diag_mv_escola_metricas;
    REFRESH MATERIALIZED VIEW diag_mv_escola_infra_saeb;
    REFRESH MATERIALIZED VIEW diag_mv_docentes_agg;
END $$;

GRANT EXECUTE ON FUNCTION refresh_diag_mvs() TO authenticated, service_role;
