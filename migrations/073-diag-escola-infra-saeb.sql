-- ═════════════════════════════════════════════════════════════════
-- Migration 073 — Cruzamento Censo × Saeb por escola
-- Calcula a posição de cada escola no plano (infra × % nível 0 do Saeb)
-- e classifica em 4 quadrantes editorialmente úteis. Compara cada
-- métrica contra a mediana nacional para a mesma etapa/disciplina —
-- importante porque % nível 0 varia muito entre etapas
-- (5º EF mediana 3,5% LP × 9º EF mediana 15% LP).
-- ═════════════════════════════════════════════════════════════════

DROP MATERIALIZED VIEW IF EXISTS diag_mv_escola_infra_saeb;

CREATE MATERIALIZED VIEW diag_mv_escola_infra_saeb AS
WITH
medianas_nacionais AS (
  SELECT
    etapa, disciplina,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY (distribuicao->>'0')::numeric) AS n0_mediana
  FROM diag_saeb_snapshots
  WHERE distribuicao IS NOT NULL
    AND ano = (SELECT MAX(ano) FROM diag_saeb_snapshots)
  GROUP BY etapa, disciplina
),
infra_esc AS (
  SELECT
    codigo_inep,
    score_basica, score_pedagogica, score_acessibilidade, score_conectividade,
    -- score_geral é média dos 4 (com NULL ignorado pelo NULLIF)
    (COALESCE(score_basica,0) + COALESCE(score_pedagogica,0) +
     COALESCE(score_acessibilidade,0) + COALESCE(score_conectividade,0)) /
    NULLIF((CASE WHEN score_basica IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN score_pedagogica IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN score_acessibilidade IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN score_conectividade IS NOT NULL THEN 1 ELSE 0 END), 0)::numeric AS score_geral
  FROM diag_censo_infra
),
saeb_esc_norm AS (
  -- Para cada (escola, etapa, disc) calcula o desvio do n0 da escola
  -- contra a mediana nacional daquela etapa+disc. Positivo = escola
  -- pior que mediana (mais alunos no nível 0).
  SELECT
    s.codigo_inep,
    AVG((s.distribuicao->>'0')::numeric)                                         AS pct_n0_avg_simples,
    AVG((s.distribuicao->>'0')::numeric - mn.n0_mediana)                          AS n0_diff_mediana,
    AVG(((s.distribuicao->>'0')::numeric - mn.n0_mediana) / NULLIF(mn.n0_mediana, 0)) AS n0_ratio_mediana,
    MAX(s.ano) AS saeb_ano,
    COUNT(*) AS qtd_saeb_rows
  FROM diag_saeb_snapshots s
  JOIN medianas_nacionais mn USING (etapa, disciplina)
  WHERE s.distribuicao IS NOT NULL
    AND s.ano = (SELECT MAX(ano) FROM diag_saeb_snapshots)
  GROUP BY s.codigo_inep
)
SELECT
  i.codigo_inep,
  i.score_basica, i.score_pedagogica, i.score_acessibilidade, i.score_conectividade,
  i.score_geral,
  s.pct_n0_avg_simples,
  s.n0_diff_mediana,
  s.n0_ratio_mediana,
  s.saeb_ano,
  -- Quadrante editorial: infra >= 60 (mediana nacional ~62) e
  -- n0_diff_mediana <= 0 (escola igual ou melhor que mediana nacional)
  CASE
    WHEN i.score_geral IS NULL OR s.n0_diff_mediana IS NULL THEN 'sem_dados'
    WHEN i.score_geral >= 60 AND s.n0_diff_mediana <= 0  THEN 'q1_bem_servida_aprende'
    WHEN i.score_geral >= 60 AND s.n0_diff_mediana >  0  THEN 'q2_estrutura_resultado_baixo'
    WHEN i.score_geral <  60 AND s.n0_diff_mediana <= 0  THEN 'q3_faz_mais_com_menos'
    ELSE 'q4_dupla_vulnerabilidade'
  END AS quadrante
FROM infra_esc i
LEFT JOIN saeb_esc_norm s USING (codigo_inep);

CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_inf_saeb_pk
  ON diag_mv_escola_infra_saeb(codigo_inep);
CREATE INDEX IF NOT EXISTS idx_diag_mv_inf_saeb_quadrante
  ON diag_mv_escola_infra_saeb(quadrante);

GRANT SELECT ON diag_mv_escola_infra_saeb TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────
-- View detalhada por (escola, etapa, disciplina) com mediana nacional
-- pra alimentar o componente que mostra breakdown.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW diag_view_escola_n0_breakdown AS
SELECT
  s.codigo_inep,
  s.etapa,
  s.disciplina,
  s.ano,
  (s.distribuicao->>'0')::numeric AS pct_n0_escola,
  mn.n0_mediana                   AS pct_n0_mediana_brasil,
  ((s.distribuicao->>'0')::numeric - mn.n0_mediana) AS diff_mediana
FROM diag_saeb_snapshots s
JOIN (
  SELECT etapa, disciplina,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY (distribuicao->>'0')::numeric) AS n0_mediana
  FROM diag_saeb_snapshots
  WHERE distribuicao IS NOT NULL
  GROUP BY etapa, disciplina
) mn USING (etapa, disciplina)
WHERE s.distribuicao IS NOT NULL;

GRANT SELECT ON diag_view_escola_n0_breakdown TO anon, authenticated, service_role;

-- Refresh helper
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
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_escola_metricas;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_escola_infra_saeb;
END;
$$;
