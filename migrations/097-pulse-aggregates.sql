-- ─────────────────────────────────────────────────────────────────────────
-- 097 — Pulso de Desenvolvimento (Etapa 2: agregados)
--
-- Cria a MV `pulse_mv_aggregates` que produz médias por dimensão e grupo
-- (empresa, área, cargo) × momento (T0/T2). Cada linha tem o n efetivo
-- de respondentes — a camada de aplicação aplica o guard n>=7.
--
-- O "índice geral" da dimensão é a média do colaborador nas duas perguntas
-- da dimensão (cada colab vira 1 ponto). O índice geral do pulso (12
-- perguntas) é representado por dimension_key = '_geral'.
--
-- Refresh: `SELECT refresh_pulse_aggregates();` — chamado pela camada
-- de aplicação após mudanças relevantes (fim de período T0/T2).
-- ─────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS pulse_mv_aggregates CASCADE;

CREATE MATERIALIZED VIEW pulse_mv_aggregates AS
WITH base AS (
  SELECT
    r.empresa_id,
    r.ciclo_id,
    r.pulse_moment,
    r.dimension_key,
    r.colaborador_id,
    r.numeric_answer,
    c.cargo,
    c.area_depto
  FROM pulse_responses r
  JOIN colaboradores c ON c.id = r.colaborador_id
  WHERE r.numeric_answer IS NOT NULL
),
-- Por colab × dimensão: média das 2 perguntas da dimensão
por_colab_dim AS (
  SELECT empresa_id, ciclo_id, pulse_moment, dimension_key,
         colaborador_id, cargo, area_depto,
         AVG(numeric_answer)::numeric(4,2) AS colab_score
  FROM base
  GROUP BY empresa_id, ciclo_id, pulse_moment, dimension_key, colaborador_id, cargo, area_depto
),
-- Por colab × pulso: média das 12 perguntas (índice geral do colab)
por_colab_geral AS (
  SELECT empresa_id, ciclo_id, pulse_moment, '_geral'::text AS dimension_key,
         colaborador_id, cargo, area_depto,
         AVG(numeric_answer)::numeric(4,2) AS colab_score
  FROM base
  GROUP BY empresa_id, ciclo_id, pulse_moment, colaborador_id, cargo, area_depto
),
unidade AS (
  SELECT * FROM por_colab_dim
  UNION ALL SELECT * FROM por_colab_geral
),
-- Agrega por company
agg_company AS (
  SELECT empresa_id, ciclo_id, 'company'::text AS group_type,
         'all'::text AS group_key,
         pulse_moment, dimension_key,
         COUNT(DISTINCT colaborador_id) AS respondent_count,
         AVG(colab_score)::numeric(4,2) AS avg_score
  FROM unidade
  GROUP BY empresa_id, ciclo_id, pulse_moment, dimension_key
),
-- Por área
agg_area AS (
  SELECT empresa_id, ciclo_id, 'area'::text AS group_type,
         COALESCE(area_depto, 'Sem área') AS group_key,
         pulse_moment, dimension_key,
         COUNT(DISTINCT colaborador_id) AS respondent_count,
         AVG(colab_score)::numeric(4,2) AS avg_score
  FROM unidade
  WHERE area_depto IS NOT NULL
  GROUP BY empresa_id, ciclo_id, area_depto, pulse_moment, dimension_key
),
-- Por cargo
agg_cargo AS (
  SELECT empresa_id, ciclo_id, 'cargo'::text AS group_type,
         COALESCE(cargo, 'Sem cargo') AS group_key,
         pulse_moment, dimension_key,
         COUNT(DISTINCT colaborador_id) AS respondent_count,
         AVG(colab_score)::numeric(4,2) AS avg_score
  FROM unidade
  WHERE cargo IS NOT NULL
  GROUP BY empresa_id, ciclo_id, cargo, pulse_moment, dimension_key
)
SELECT * FROM agg_company
UNION ALL SELECT * FROM agg_area
UNION ALL SELECT * FROM agg_cargo;

CREATE UNIQUE INDEX idx_pulse_mv_aggregates_uk
  ON pulse_mv_aggregates (empresa_id, ciclo_id, group_type, group_key, pulse_moment, dimension_key);

CREATE INDEX idx_pulse_mv_aggregates_ciclo
  ON pulse_mv_aggregates (empresa_id, ciclo_id, pulse_moment);


-- Função de refresh — usada pela camada de aplicação
CREATE OR REPLACE FUNCTION refresh_pulse_aggregates()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY pulse_mv_aggregates;
END;
$$;


-- Refresh inicial (não há dados ainda, é só pra hidratar a MV)
REFRESH MATERIALIZED VIEW pulse_mv_aggregates;

-- Verificação
SELECT 'pulse_mv_aggregates' AS mv, COUNT(*) AS linhas FROM pulse_mv_aggregates;
