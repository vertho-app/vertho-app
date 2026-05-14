-- ============================================================================
-- 095: Idade-corte do Onboarding configurável (24 ou 29 anos)
-- ============================================================================
--
-- A migration 094 hardcoded qt_docs_jovens = qt_doc_bas_0_24 + qt_doc_bas_25_29
-- (= até 29 anos). Como o INEP só publica idades em faixas fixas, o input
-- "Idade-corte Onboarding" não tinha efeito (sempre somava as duas faixas).
--
-- Esta migration adiciona a coluna `qt_doc_0_24` separada — assim o backend
-- pode escolher:
--   - Corte 24: usa qt_doc_0_24 puro
--   - Corte 29: usa qt_docs_jovens (soma 0-24 + 25-29)
--
-- ETAPA ÚNICA: ALTER + UPDATE da tabela base + DROP/CREATE das 3 MVs.
-- Total ~2-5 min. SET statement_timeout cobre o gateway timeout.
-- ============================================================================

SET statement_timeout = '15min';

-- ── 1. Adiciona coluna qt_doc_0_24 na tabela base ────────────────────────
ALTER TABLE _tmp_mercado_escola_raw
  ADD COLUMN IF NOT EXISTS qt_doc_0_24 INT DEFAULT 0;

-- Popula a coluna nova com SELECT DISTINCT ON (mais rápido que LATERAL JOIN)
WITH censo_docentes_latest AS (
  SELECT DISTINCT ON (codigo_inep) codigo_inep, qt_doc_bas_0_24
  FROM diag_censo_docentes
  ORDER BY codigo_inep, ano DESC
)
UPDATE _tmp_mercado_escola_raw t
SET qt_doc_0_24 = COALESCE(c.qt_doc_bas_0_24, 0)
FROM censo_docentes_latest c
WHERE t.codigo_inep = c.codigo_inep;

-- ── 2. Drop MV escola + agregadas (CASCADE) e recria com a nova coluna ──
DROP MATERIALIZED VIEW IF EXISTS diag_mv_mercado_escola CASCADE;

CREATE MATERIALIZED VIEW diag_mv_mercado_escola AS
WITH scored AS (
  SELECT *,
    (
      0.20 * COALESCE(score_pedagogica, 0)
      + 0.15 * COALESCE(score_conectividade, 0)
      + 0.15 * COALESCE(score_basica, 0)
      + 0.10 * (in_climatizacao * 100)
      + 0.10 * LEAST(100, qt_devices_aluno * 5.0)
      + 0.10 * (in_lab_ciencias * 100)
      + 0.10 * (in_quadra_coberta * 100)
      + 0.05 * (in_auditorio * 100)
      + 0.05 * LEAST(100, (qt_docs_pos::numeric * 100.0 / NULLIF(qt_professores, 0)))
    )::numeric(5,2) AS inse_proxy_score
  FROM _tmp_mercado_escola_raw
)
SELECT *,
  CASE
    WHEN inse_proxy_score < 15 THEN 1
    WHEN inse_proxy_score < 35 THEN 2
    WHEN inse_proxy_score < 55 THEN 3
    WHEN inse_proxy_score < 75 THEN 4
    WHEN inse_proxy_score < 90 THEN 5
    ELSE 6
  END::smallint AS inse_proxy_grupo,
  COALESCE(
    inse_grupo,
    CASE
      WHEN inse_proxy_score < 15 THEN 1
      WHEN inse_proxy_score < 35 THEN 2
      WHEN inse_proxy_score < 55 THEN 3
      WHEN inse_proxy_score < 75 THEN 4
      WHEN inse_proxy_score < 90 THEN 5
      ELSE 6
    END
  )::smallint AS inse_efetivo,
  CASE WHEN inse_grupo IS NOT NULL THEN 'oficial' ELSE 'inferido' END AS inse_fonte
FROM scored;

CREATE UNIQUE INDEX idx_mv_mercado_escola_inep
  ON diag_mv_mercado_escola(codigo_inep);
CREATE INDEX idx_mv_mercado_escola_uf
  ON diag_mv_mercado_escola(uf, rede);
CREATE INDEX idx_mv_mercado_escola_municipio
  ON diag_mv_mercado_escola(municipio_ibge, rede);
CREATE INDEX idx_mv_mercado_escola_inse
  ON diag_mv_mercado_escola(inse_efetivo);

-- ── 3. Recria MVs agregadas (município + rede) com qt_docs_0_24 sumado ──
CREATE MATERIALIZED VIEW diag_mv_mercado_municipio AS
SELECT
  municipio_ibge,
  MIN(municipio)                                          AS municipio,
  MIN(uf)                                                 AS uf,
  MIN(microrregiao)                                       AS microrregiao,
  COUNT(*)                                                AS qt_escolas,
  COUNT(*) FILTER (WHERE rede = 'MUNICIPAL')              AS qt_escolas_municipal,
  COUNT(*) FILTER (WHERE rede = 'ESTADUAL')               AS qt_escolas_estadual,
  COUNT(*) FILTER (WHERE rede = 'FEDERAL')                AS qt_escolas_federal,
  COUNT(*) FILTER (WHERE rede = 'PRIVADA')                AS qt_escolas_privada,
  SUM(qt_professores)                                     AS qt_professores,
  SUM(qt_doc_0_24)                                        AS qt_docs_0_24,
  SUM(qt_docs_jovens)                                     AS qt_docs_jovens,
  SUM(qt_docs_pos)                                        AS qt_docs_pos,
  SUM(qt_coord_pedag + qt_diretor_proxy)                  AS qt_gestores,
  AVG(inse_efetivo) FILTER (WHERE inse_efetivo IS NOT NULL) AS inse_medio,
  ROUND(100.0 * COUNT(*) FILTER (WHERE inse_fonte = 'oficial') / NULLIF(COUNT(*), 0), 1)
                                                          AS pct_inse_oficial,
  AVG(score_conectividade)                                AS score_conectividade
FROM diag_mv_mercado_escola
GROUP BY municipio_ibge;

CREATE UNIQUE INDEX idx_mv_mercado_municipio_ibge
  ON diag_mv_mercado_municipio(municipio_ibge);
CREATE INDEX idx_mv_mercado_municipio_uf
  ON diag_mv_mercado_municipio(uf);

CREATE MATERIALIZED VIEW diag_mv_mercado_rede AS
SELECT
  municipio_ibge,
  MIN(municipio)                                          AS municipio,
  MIN(uf)                                                 AS uf,
  rede,
  COUNT(*)                                                AS qt_escolas,
  SUM(qt_professores)                                     AS qt_professores,
  SUM(qt_doc_0_24)                                        AS qt_docs_0_24,
  SUM(qt_docs_jovens)                                     AS qt_docs_jovens,
  SUM(qt_docs_pos)                                        AS qt_docs_pos,
  SUM(qt_coord_pedag + qt_diretor_proxy)                  AS qt_gestores,
  AVG(inse_efetivo) FILTER (WHERE inse_efetivo IS NOT NULL) AS inse_medio,
  ROUND(100.0 * COUNT(*) FILTER (WHERE inse_fonte = 'oficial') / NULLIF(COUNT(*), 0), 1)
                                                          AS pct_inse_oficial
FROM diag_mv_mercado_escola
GROUP BY municipio_ibge, rede;

CREATE UNIQUE INDEX idx_mv_mercado_rede_pk
  ON diag_mv_mercado_rede(municipio_ibge, rede);
CREATE INDEX idx_mv_mercado_rede_uf
  ON diag_mv_mercado_rede(uf, rede);

-- ── 4. Atualiza função refresh pra incluir qt_doc_0_24 no INSERT ────────
CREATE OR REPLACE FUNCTION refresh_mv_mercado_potencial() RETURNS void AS $$
BEGIN
  TRUNCATE TABLE _tmp_mercado_escola_raw;
  INSERT INTO _tmp_mercado_escola_raw
  WITH censo_docentes_latest AS (
    SELECT DISTINCT ON (codigo_inep) * FROM diag_censo_docentes ORDER BY codigo_inep, ano DESC
  ),
  censo_infra_latest AS (
    SELECT DISTINCT ON (codigo_inep) * FROM diag_censo_infra ORDER BY codigo_inep, ano DESC
  )
  SELECT
    e.codigo_inep, e.nome, e.municipio, e.municipio_ibge, e.uf, e.rede, e.microrregiao,
    e.inse_grupo, e.etapas,
    COALESCE(d.qt_doc_bas, 0),
    COALESCE(d.qt_doc_bas_0_24, 0) + COALESCE(d.qt_doc_bas_25_29, 0),
    COALESCE(d.qt_doc_bas_esco_sup_pos_espec, 0) + COALESCE(d.qt_doc_bas_esco_sup_pos_mestra, 0) + COALESCE(d.qt_doc_bas_esco_sup_pos_douto, 0),
    COALESCE((i.quantidades->>'QT_PROF_COORDENADOR')::int, 0) + COALESCE((i.quantidades->>'QT_PROF_PEDAGOGIA')::int, 0),
    1,
    i.score_conectividade, i.score_pedagogica, i.score_basica,
    COALESCE((i.indicadores->>'IN_CLIMATIZACAO')::int, 0),
    COALESCE((i.indicadores->>'IN_LABORATORIO_CIENCIAS')::int, 0),
    COALESCE((i.indicadores->>'IN_QUADRA_ESPORTES_COBERTA')::int, 0),
    COALESCE((i.indicadores->>'IN_AUDITORIO')::int, 0),
    COALESCE((i.quantidades->>'QT_DESKTOP_ALUNO')::int, 0) + COALESCE((i.quantidades->>'QT_COMP_PORTATIL_ALUNO')::int, 0) + COALESCE((i.quantidades->>'QT_TABLET_ALUNO')::int, 0),
    COALESCE(d.qt_doc_bas_0_24, 0)
  FROM diag_escolas e
  LEFT JOIN censo_docentes_latest d ON d.codigo_inep = e.codigo_inep
  LEFT JOIN censo_infra_latest i ON i.codigo_inep = e.codigo_inep
  WHERE e.status = 'ativa';
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_mercado_escola;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_mercado_municipio;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_mercado_rede;
END $$ LANGUAGE plpgsql;
