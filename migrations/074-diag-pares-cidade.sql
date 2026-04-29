-- ═════════════════════════════════════════════════════════════════
-- Migration 074 — Comparativo nominal: pares INSE na mesma cidade
-- Lista as escolas mais próximas socioeconomicamente da escola-alvo:
-- mesmo município + mesmo grupo INSE. Ordena por Saeb LP médio
-- (etapa coincidente quando possível). Útil para "compare-se com seus
-- vizinhos diretos" — leitura imediata pra diretor escolar.
-- ═════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS diag_escola_pares_cidade(TEXT, INTEGER);

CREATE FUNCTION diag_escola_pares_cidade(p_inep TEXT, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  codigo_inep   TEXT,
  nome          TEXT,
  rede          TEXT,
  is_target     BOOLEAN,
  saeb_lp       NUMERIC,
  saeb_mat      NUMERIC,
  saeb_geral    NUMERIC,
  ideb_principal NUMERIC,
  rank_geral    INTEGER,
  total_pares   INTEGER
) AS $$
  WITH alvo AS (
    SELECT m.*, e.nome AS escola_nome, e.rede AS escola_rede
    FROM diag_mv_escola_metricas m
    JOIN diag_escolas e USING (codigo_inep)
    WHERE m.codigo_inep = p_inep
  ),
  candidatos AS (
    -- Mesma cidade + mesmo INSE; sem INSE: cai pra mesma cidade qualquer
    SELECT m.codigo_inep, e.nome, e.rede,
      m.saeb_5ef_lp, m.saeb_5ef_mat,
      m.saeb_9ef_lp, m.saeb_9ef_mat,
      m.saeb_3em_lp, m.saeb_3em_mat,
      m.ideb_5ef, m.ideb_9ef, m.ideb_3em
    FROM diag_mv_escola_metricas m
    JOIN diag_escolas e USING (codigo_inep)
    JOIN alvo a ON e.municipio_ibge = (SELECT municipio_ibge FROM diag_escolas WHERE codigo_inep = p_inep)
    WHERE (a.inse_grupo IS NULL OR m.inse_grupo = a.inse_grupo)
  ),
  -- Decide qual etapa usar pra ordenar — preferência da escola alvo
  etapa_alvo AS (
    SELECT
      CASE
        WHEN saeb_9ef_lp IS NOT NULL OR saeb_9ef_mat IS NOT NULL THEN '9_EF'
        WHEN saeb_5ef_lp IS NOT NULL OR saeb_5ef_mat IS NOT NULL THEN '5_EF'
        WHEN saeb_3em_lp IS NOT NULL OR saeb_3em_mat IS NOT NULL THEN '3_EM'
        ELSE '5_EF'
      END AS etapa
    FROM alvo
  ),
  ranked AS (
    SELECT
      c.codigo_inep,
      c.nome,
      c.rede,
      (c.codigo_inep = p_inep) AS is_target,
      CASE (SELECT etapa FROM etapa_alvo)
        WHEN '5_EF' THEN c.saeb_5ef_lp
        WHEN '9_EF' THEN c.saeb_9ef_lp
        WHEN '3_EM' THEN c.saeb_3em_lp
      END AS saeb_lp,
      CASE (SELECT etapa FROM etapa_alvo)
        WHEN '5_EF' THEN c.saeb_5ef_mat
        WHEN '9_EF' THEN c.saeb_9ef_mat
        WHEN '3_EM' THEN c.saeb_3em_mat
      END AS saeb_mat,
      CASE (SELECT etapa FROM etapa_alvo)
        WHEN '5_EF' THEN c.ideb_5ef
        WHEN '9_EF' THEN c.ideb_9ef
        WHEN '3_EM' THEN c.ideb_3em
      END AS ideb_principal
    FROM candidatos c
  ),
  com_geral AS (
    SELECT *,
      CASE
        WHEN saeb_lp IS NOT NULL AND saeb_mat IS NOT NULL THEN (saeb_lp + saeb_mat)/2
        WHEN saeb_lp IS NOT NULL THEN saeb_lp
        WHEN saeb_mat IS NOT NULL THEN saeb_mat
        ELSE NULL
      END AS saeb_geral
    FROM ranked
  ),
  com_rank AS (
    SELECT *,
      RANK() OVER (ORDER BY saeb_geral DESC NULLS LAST)::INTEGER AS rank_geral,
      COUNT(*) OVER () AS total_pares
    FROM com_geral
  ),
  -- Inclui sempre a target + top-(p_limit-1) pares
  selecionados AS (
    SELECT * FROM com_rank WHERE is_target
    UNION ALL
    SELECT * FROM com_rank WHERE NOT is_target
    ORDER BY is_target DESC, rank_geral ASC
    LIMIT p_limit
  )
  SELECT
    s.codigo_inep, s.nome, s.rede, s.is_target,
    s.saeb_lp, s.saeb_mat, s.saeb_geral, s.ideb_principal,
    s.rank_geral, s.total_pares::INTEGER
  FROM selecionados s
  ORDER BY s.rank_geral ASC;
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION diag_escola_pares_cidade(TEXT, INTEGER) TO anon, authenticated, service_role;
