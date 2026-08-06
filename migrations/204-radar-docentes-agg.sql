-- ============================================================================
-- 204: Corpo docente no Radar público (escola / município / estado)
-- ============================================================================
--
-- `diag_censo_docentes` (migration 080, Censo Escolar 2025) já está populada
-- com 178.772 escolas, mas só era lida pelo admin (contadores + qualidade de
-- dados). O Radar público não mostrava nada sobre professores.
--
-- Página da escola lê a tabela direto (1 linha). Município e estado precisam de
-- agregação: esta MV consolida por (municipio_ibge × rede), o que permite tanto
-- o total do município (soma das redes) quanto o recorte "só rede municipal"
-- e o total da UF (soma dos municípios).
--
-- ⚠️ SEMÂNTICA: QT_DOC_BAS é o número de docentes ATUANDO NAQUELA ESCOLA. Somar
-- entre escolas conta duas vezes o professor que atua em duas escolas (a soma
-- nacional dá ~2,99M contra ~2,3M de docentes únicos do INEP). Por isso o
-- agregado se chama VÍNCULOS docentes — a UI precisa usar esse rótulo.
--
-- Não filtra por status da escola: só entra escola que tem registro de docente
-- no censo, e `escolas_com_dado` deixa o denominador explícito.
-- ============================================================================

SET statement_timeout = '10min';

DROP MATERIALIZED VIEW IF EXISTS diag_mv_docentes_agg CASCADE;

CREATE MATERIALIZED VIEW diag_mv_docentes_agg AS
WITH docentes_latest AS (
  SELECT DISTINCT ON (codigo_inep) *
  FROM diag_censo_docentes
  ORDER BY codigo_inep, ano DESC
),
infra_latest AS (
  SELECT DISTINCT ON (codigo_inep) codigo_inep, matriculas
  FROM diag_censo_infra
  ORDER BY codigo_inep, ano DESC
)
SELECT
  e.municipio_ibge,
  COALESCE(e.rede, 'OUTRA')                             AS rede,
  MIN(e.uf)                                             AS uf,
  MAX(d.ano)::smallint                                  AS ano,
  COUNT(*)::int                                         AS escolas_com_dado,
  COALESCE(SUM(d.qt_doc_bas), 0)::int                   AS docentes_total,
  COALESCE(SUM(d.qt_doc_inf), 0)::int                   AS docentes_infantil,
  COALESCE(SUM(d.qt_doc_fund), 0)::int                  AS docentes_fundamental,
  COALESCE(SUM(d.qt_doc_med), 0)::int                   AS docentes_medio,
  COALESCE(SUM(d.qt_doc_bas_esco_sup_grad), 0)::int     AS docentes_superior,
  COALESCE(SUM(d.qt_doc_bas_esco_sup_grad_licen), 0)::int AS docentes_licenciatura,
  -- Níveis de pós ficam SEPARADOS de propósito: o INEP conta o mesmo docente em
  -- mais de uma categoria (quem tem especialização E mestrado entra nas duas),
  -- então somá-las passa do total (medido: rede federal de Jundiaí, 35 de 28).
  COALESCE(SUM(d.qt_doc_bas_esco_sup_pos_espec), 0)::int  AS docentes_especializacao,
  COALESCE(SUM(d.qt_doc_bas_esco_sup_pos_mestra), 0)::int AS docentes_mestrado,
  COALESCE(SUM(d.qt_doc_bas_esco_sup_pos_douto), 0)::int  AS docentes_doutorado,
  COALESCE(SUM(d.qt_doc_bas_vinculo_concur), 0)::int    AS docentes_concursados,
  COALESCE(SUM(d.qt_doc_bas_vinculo_contra), 0)::int    AS docentes_contrato,
  COALESCE(SUM(d.qt_doc_bas_vinculo_terceir), 0)::int   AS docentes_terceirizados,
  COALESCE(SUM(d.qt_doc_bas_vinculo_clt), 0)::int       AS docentes_clt,
  COALESCE(SUM(
    COALESCE(d.qt_doc_bas_0_24, 0) + COALESCE(d.qt_doc_bas_25_29, 0)
  ), 0)::int                                            AS docentes_ate_29,
  COALESCE(SUM(
    COALESCE(d.qt_doc_bas_50_54, 0)
    + COALESCE(d.qt_doc_bas_55_59, 0)
    + COALESCE(d.qt_doc_bas_60_mais, 0)
  ), 0)::int                                            AS docentes_50_mais,
  COALESCE(SUM(d.qt_doc_bas_fem), 0)::int               AS docentes_fem,
  COALESCE(SUM(d.qt_doc_bas_masc), 0)::int              AS docentes_masc,
  -- Matrículas SÓ das escolas que entram nesta soma — assim alunos/docente
  -- usa o mesmo conjunto de escolas no numerador e no denominador.
  COALESCE(SUM(i.matriculas), 0)::int                   AS matriculas_total
FROM docentes_latest d
JOIN diag_escolas e ON e.codigo_inep = d.codigo_inep
LEFT JOIN infra_latest i ON i.codigo_inep = d.codigo_inep
WHERE e.municipio_ibge IS NOT NULL
GROUP BY e.municipio_ibge, COALESCE(e.rede, 'OUTRA');

-- Unique index é pré-requisito do REFRESH ... CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_docentes_agg_pk
  ON diag_mv_docentes_agg(municipio_ibge, rede);
CREATE INDEX IF NOT EXISTS idx_mv_docentes_agg_uf
  ON diag_mv_docentes_agg(uf);

-- SEM grant para anon/authenticated: o Radar lê por service-role
-- (`createSupabaseAdmin`), e MV exposta a anon viola o INV4 de
-- `tests/unit/security/rls-posture.test.ts` (a migration 080 é anterior a esse
-- guard — não copiar o GRANT dela).
REVOKE ALL ON diag_mv_docentes_agg FROM anon, authenticated;
GRANT SELECT ON diag_mv_docentes_agg TO service_role;

-- Refresh junto com as demais MVs do Radar (definição atual + a nova).
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
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_docentes_agg;
EXCEPTION
  WHEN feature_not_supported THEN
    -- fallback: refresh sem CONCURRENTLY se algum índice único faltar
    REFRESH MATERIALIZED VIEW diag_mv_escola_saeb_agg;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_saeb_agg;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_ica_recent;
    REFRESH MATERIALIZED VIEW diag_mv_estado_stats;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_metricas;
    REFRESH MATERIALIZED VIEW diag_mv_municipio_metricas_municipal;
    REFRESH MATERIALIZED VIEW diag_mv_docentes_agg;
END $$;
