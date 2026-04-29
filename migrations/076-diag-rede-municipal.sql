-- ═════════════════════════════════════════════════════════════════
-- Migration 076 — Análise interna da rede municipal
-- Funções RPC pra a página /radar/rede/[ibge] que mostra a dispersão,
-- top/bottom escolas e distribuição por INSE de uma rede municipal.
-- ═════════════════════════════════════════════════════════════════

-- ── 1. Stats agregadas da rede (saeb LP+Mat por etapa, com quartis) ──
DROP FUNCTION IF EXISTS diag_rede_stats(TEXT);

CREATE FUNCTION diag_rede_stats(p_ibge TEXT)
RETURNS TABLE (
  qtd_escolas       INTEGER,
  saeb_lp_avg       NUMERIC,
  saeb_lp_stddev    NUMERIC,
  saeb_lp_min       NUMERIC,
  saeb_lp_max       NUMERIC,
  saeb_lp_p25       NUMERIC,
  saeb_lp_p75       NUMERIC,
  saeb_mat_avg      NUMERIC,
  saeb_mat_stddev   NUMERIC,
  saeb_mat_min      NUMERIC,
  saeb_mat_max      NUMERIC,
  saeb_mat_p25      NUMERIC,
  saeb_mat_p75      NUMERIC,
  ideb_avg          NUMERIC,
  ideb_stddev       NUMERIC,
  ideb_min          NUMERIC,
  ideb_max          NUMERIC,
  etapa             TEXT
) AS $$
  WITH base AS (
    SELECT m.* FROM diag_mv_escola_metricas m
    JOIN diag_escolas e USING (codigo_inep)
    WHERE e.municipio_ibge = p_ibge
  ),
  -- Detecta etapa principal: a com mais escolas com Saeb (5_EF tipicamente)
  etapa_pick AS (
    SELECT etapa FROM (
      SELECT '5_EF' AS etapa, COUNT(*) AS n FROM base WHERE saeb_5ef_lp IS NOT NULL OR saeb_5ef_mat IS NOT NULL
      UNION ALL
      SELECT '9_EF', COUNT(*) FROM base WHERE saeb_9ef_lp IS NOT NULL OR saeb_9ef_mat IS NOT NULL
      UNION ALL
      SELECT '3_EM', COUNT(*) FROM base WHERE saeb_3em_lp IS NOT NULL OR saeb_3em_mat IS NOT NULL
    ) sub WHERE n > 0 ORDER BY n DESC LIMIT 1
  ),
  vals AS (
    SELECT
      (SELECT etapa FROM etapa_pick) AS etapa,
      CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN saeb_5ef_lp WHEN '9_EF' THEN saeb_9ef_lp WHEN '3_EM' THEN saeb_3em_lp END AS lp,
      CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN saeb_5ef_mat WHEN '9_EF' THEN saeb_9ef_mat WHEN '3_EM' THEN saeb_3em_mat END AS mat,
      CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN ideb_5ef WHEN '9_EF' THEN ideb_9ef WHEN '3_EM' THEN ideb_3em END AS ideb
    FROM base
  )
  SELECT
    COUNT(*) FILTER (WHERE lp IS NOT NULL OR mat IS NOT NULL)::INTEGER AS qtd_escolas,
    AVG(lp)::NUMERIC,    STDDEV_SAMP(lp)::NUMERIC,    MIN(lp)::NUMERIC,    MAX(lp)::NUMERIC,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY lp)::NUMERIC,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY lp)::NUMERIC,
    AVG(mat)::NUMERIC,   STDDEV_SAMP(mat)::NUMERIC,   MIN(mat)::NUMERIC,   MAX(mat)::NUMERIC,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY mat)::NUMERIC,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY mat)::NUMERIC,
    AVG(ideb)::NUMERIC,  STDDEV_SAMP(ideb)::NUMERIC,  MIN(ideb)::NUMERIC,  MAX(ideb)::NUMERIC,
    (SELECT etapa FROM etapa_pick)
  FROM vals
  WHERE lp IS NOT NULL OR mat IS NOT NULL OR ideb IS NOT NULL;
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION diag_rede_stats(TEXT) TO anon, authenticated, service_role;

-- ── 2. Top/bottom escolas da rede + ranking ─────────────────────────
DROP FUNCTION IF EXISTS diag_rede_ranking(TEXT, INTEGER);

CREATE FUNCTION diag_rede_ranking(p_ibge TEXT, p_limit INTEGER DEFAULT 5)
RETURNS TABLE (
  codigo_inep   TEXT,
  nome          TEXT,
  rede          TEXT,
  inse_grupo    SMALLINT,
  saeb_geral    NUMERIC,
  saeb_lp       NUMERIC,
  saeb_mat      NUMERIC,
  ideb          NUMERIC,
  rank_total    INTEGER,
  qtd_total     INTEGER,
  posicao       TEXT  -- 'top' ou 'bottom'
) AS $$
  WITH base AS (
    SELECT m.*, e.nome, e.rede AS rede_nome
    FROM diag_mv_escola_metricas m
    JOIN diag_escolas e USING (codigo_inep)
    WHERE e.municipio_ibge = p_ibge
  ),
  etapa_pick AS (
    SELECT etapa FROM (
      SELECT '5_EF' AS etapa, COUNT(*) AS n FROM base WHERE saeb_5ef_lp IS NOT NULL OR saeb_5ef_mat IS NOT NULL
      UNION ALL
      SELECT '9_EF', COUNT(*) FROM base WHERE saeb_9ef_lp IS NOT NULL OR saeb_9ef_mat IS NOT NULL
      UNION ALL
      SELECT '3_EM', COUNT(*) FROM base WHERE saeb_3em_lp IS NOT NULL OR saeb_3em_mat IS NOT NULL
    ) sub WHERE n > 0 ORDER BY n DESC LIMIT 1
  ),
  com_valores AS (
    SELECT
      b.codigo_inep, b.nome, b.rede_nome AS rede, b.inse_grupo,
      CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN b.saeb_5ef_lp WHEN '9_EF' THEN b.saeb_9ef_lp WHEN '3_EM' THEN b.saeb_3em_lp END AS saeb_lp,
      CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN b.saeb_5ef_mat WHEN '9_EF' THEN b.saeb_9ef_mat WHEN '3_EM' THEN b.saeb_3em_mat END AS saeb_mat,
      CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN b.ideb_5ef WHEN '9_EF' THEN b.ideb_9ef WHEN '3_EM' THEN b.ideb_3em END AS ideb
    FROM base b
  ),
  com_geral AS (
    SELECT *,
      CASE WHEN saeb_lp IS NOT NULL AND saeb_mat IS NOT NULL THEN (saeb_lp + saeb_mat)/2
           WHEN saeb_lp IS NOT NULL THEN saeb_lp
           WHEN saeb_mat IS NOT NULL THEN saeb_mat
      END AS saeb_geral
    FROM com_valores
    WHERE saeb_lp IS NOT NULL OR saeb_mat IS NOT NULL
  ),
  ranked AS (
    SELECT *,
      RANK() OVER (ORDER BY saeb_geral DESC NULLS LAST)::INTEGER AS rank_total,
      COUNT(*) OVER ()::INTEGER AS qtd_total
    FROM com_geral
  ),
  top_n AS (
    SELECT *, 'top'::TEXT AS posicao FROM ranked ORDER BY rank_total ASC LIMIT p_limit
  ),
  bottom_n AS (
    SELECT *, 'bottom'::TEXT AS posicao FROM ranked ORDER BY rank_total DESC LIMIT p_limit
  ),
  selecionadas AS (
    SELECT * FROM top_n
    UNION ALL
    SELECT * FROM bottom_n
  )
  SELECT codigo_inep, nome, rede, inse_grupo,
    saeb_geral, saeb_lp, saeb_mat, ideb,
    rank_total, qtd_total, posicao
  FROM selecionadas
  ORDER BY rank_total ASC;
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION diag_rede_ranking(TEXT, INTEGER) TO anon, authenticated, service_role;

-- ── 3. Distribuição da rede por grupo INSE ──────────────────────────
DROP FUNCTION IF EXISTS diag_rede_por_inse(TEXT);

CREATE FUNCTION diag_rede_por_inse(p_ibge TEXT)
RETURNS TABLE (
  inse_grupo    SMALLINT,
  qtd_escolas   INTEGER,
  saeb_lp_avg   NUMERIC,
  saeb_mat_avg  NUMERIC,
  ideb_avg      NUMERIC
) AS $$
  WITH base AS (
    SELECT m.* FROM diag_mv_escola_metricas m
    JOIN diag_escolas e USING (codigo_inep)
    WHERE e.municipio_ibge = p_ibge
  ),
  etapa_pick AS (
    SELECT etapa FROM (
      SELECT '5_EF' AS etapa, COUNT(*) AS n FROM base WHERE saeb_5ef_lp IS NOT NULL OR saeb_5ef_mat IS NOT NULL
      UNION ALL
      SELECT '9_EF', COUNT(*) FROM base WHERE saeb_9ef_lp IS NOT NULL OR saeb_9ef_mat IS NOT NULL
      UNION ALL
      SELECT '3_EM', COUNT(*) FROM base WHERE saeb_3em_lp IS NOT NULL OR saeb_3em_mat IS NOT NULL
    ) sub WHERE n > 0 ORDER BY n DESC LIMIT 1
  )
  SELECT
    b.inse_grupo,
    COUNT(*)::INTEGER AS qtd_escolas,
    AVG(CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN b.saeb_5ef_lp WHEN '9_EF' THEN b.saeb_9ef_lp WHEN '3_EM' THEN b.saeb_3em_lp END)::NUMERIC AS saeb_lp_avg,
    AVG(CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN b.saeb_5ef_mat WHEN '9_EF' THEN b.saeb_9ef_mat WHEN '3_EM' THEN b.saeb_3em_mat END)::NUMERIC AS saeb_mat_avg,
    AVG(CASE (SELECT etapa FROM etapa_pick) WHEN '5_EF' THEN b.ideb_5ef WHEN '9_EF' THEN b.ideb_9ef WHEN '3_EM' THEN b.ideb_3em END)::NUMERIC AS ideb_avg
  FROM base b
  WHERE b.inse_grupo IS NOT NULL
  GROUP BY b.inse_grupo
  ORDER BY b.inse_grupo;
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION diag_rede_por_inse(TEXT) TO anon, authenticated, service_role;
