-- Migration 080 — Docentes do Censo Escolar + saneamento de quantidades
-- Fonte: microdados INEP `Tabela_Docente_YYYY.csv`.

CREATE TABLE IF NOT EXISTS diag_censo_docentes (
  codigo_inep                         TEXT NOT NULL REFERENCES diag_escolas(codigo_inep) ON DELETE CASCADE,
  ano                                 SMALLINT NOT NULL,

  -- Totais principais por escola/etapa
  qt_doc_bas                          INT,
  qt_doc_inf                          INT,
  qt_doc_inf_cre                      INT,
  qt_doc_inf_pre                      INT,
  qt_doc_fund                         INT,
  qt_doc_fund_ai                      INT,
  qt_doc_fund_af                      INT,
  qt_doc_med                          INT,

  -- Função e formação
  qt_doc_bas_docente                  INT,
  qt_doc_bas_auxiliar                 INT,
  qt_doc_bas_profi_monitor            INT,
  qt_doc_bas_esco_sup_grad            INT,
  qt_doc_bas_esco_sup_grad_licen      INT,
  qt_doc_bas_esco_sup_grad_slicen     INT,
  qt_doc_bas_esco_sup_pos_espec       INT,
  qt_doc_bas_esco_sup_pos_mestra      INT,
  qt_doc_bas_esco_sup_pos_douto       INT,

  -- Vínculo
  qt_doc_bas_vinculo_concur           INT,
  qt_doc_bas_vinculo_contra           INT,
  qt_doc_bas_vinculo_terceir          INT,
  qt_doc_bas_vinculo_clt              INT,

  -- Perfil resumido
  qt_doc_bas_fem                      INT,
  qt_doc_bas_masc                     INT,
  qt_doc_bas_pcd                      INT,
  qt_doc_bas_0_24                     INT,
  qt_doc_bas_25_29                    INT,
  qt_doc_bas_30_39                    INT,
  qt_doc_bas_40_49                    INT,
  qt_doc_bas_50_54                    INT,
  qt_doc_bas_55_59                    INT,
  qt_doc_bas_60_mais                  INT,

  -- Blocos completos preservados para análises futuras.
  disciplinas                         JSONB NOT NULL DEFAULT '{}',
  especializacoes                     JSONB NOT NULL DEFAULT '{}',
  quantidades                         JSONB NOT NULL DEFAULT '{}',

  ingest_run_id                       UUID,
  atualizado_em                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (codigo_inep, ano)
);

CREATE INDEX IF NOT EXISTS idx_diag_censo_docentes_ano
  ON diag_censo_docentes(ano DESC);

CREATE INDEX IF NOT EXISTS idx_diag_censo_docentes_inep_ano
  ON diag_censo_docentes(codigo_inep, ano DESC);

CREATE INDEX IF NOT EXISTS idx_diag_censo_docentes_doc_bas
  ON diag_censo_docentes(ano DESC, qt_doc_bas DESC);

ALTER TABLE diag_censo_docentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diag_censo_docentes_public_read" ON diag_censo_docentes;
CREATE POLICY "diag_censo_docentes_public_read"
  ON diag_censo_docentes
  FOR SELECT
  USING (true);

-- Saneia sentinelas e valores claramente impossíveis já salvos em
-- diag_censo_infra.quantidades. Ex.: QT_PROF_ADMINISTRATIVOS=88888.
-- A regra remove apenas valores que são sentinelas comuns ou negativos.
UPDATE diag_censo_infra d
SET
  quantidades = COALESCE(s.clean_quantidades, '{}'::jsonb),
  atualizado_em = now()
FROM (
  SELECT
    codigo_inep,
    ano,
    jsonb_object_agg(key, value) FILTER (
      WHERE NOT (
        NULLIF(value #>> '{}', '')::numeric < 0
        OR NULLIF(value #>> '{}', '')::numeric IN (8888, 88888, 9999, 99999, 999999)
        OR (key LIKE 'QT_PROF_%' AND NULLIF(value #>> '{}', '')::numeric > 1000)
      )
    ) AS clean_quantidades
  FROM diag_censo_infra
  CROSS JOIN LATERAL jsonb_each(quantidades)
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_each(quantidades) AS bad(key, value)
    WHERE
      NULLIF(bad.value #>> '{}', '')::numeric < 0
      OR NULLIF(bad.value #>> '{}', '')::numeric IN (8888, 88888, 9999, 99999, 999999)
      OR (bad.key LIKE 'QT_PROF_%' AND NULLIF(bad.value #>> '{}', '')::numeric > 1000)
  )
  GROUP BY codigo_inep, ano
) s
WHERE d.codigo_inep = s.codigo_inep
  AND d.ano = s.ano;

-- Atualiza a MV de contadores do admin para expor Censo Infra e Docentes.
DROP MATERIALIZED VIEW IF EXISTS diag_mv_radar_counts;

CREATE MATERIALIZED VIEW diag_mv_radar_counts AS
SELECT
  1 AS singleton_key,
  (SELECT COUNT(*) FROM diag_escolas) AS escolas,
  (
    SELECT COUNT(DISTINCT municipio_ibge)
    FROM diag_escolas
    WHERE municipio_ibge IS NOT NULL
  ) AS municipios,
  (SELECT COUNT(*) FROM diag_saeb_snapshots) AS saeb_snapshots,
  (SELECT COUNT(*) FROM diag_ica_snapshots) AS ica_snapshots,
  (SELECT COUNT(*) FROM diag_ideb_snapshots) AS ideb_snapshots,
  (SELECT COUNT(*) FROM diag_censo_infra) AS censo_infra,
  (SELECT COUNT(*) FROM diag_censo_docentes) AS censo_docentes,
  (SELECT COUNT(*) FROM diag_saresp_snapshots) AS saresp_snapshots,
  (SELECT COUNT(*) FROM diag_fundeb_repasses) AS fundeb_repasses,
  (SELECT COUNT(*) FROM diag_pdde_repasses) AS pdde_escola,
  (SELECT COUNT(*) FROM diag_pdde_municipal) AS pdde_municipal,
  (SELECT COUNT(*) FROM diag_fundeb_vaar) AS vaar,
  (SELECT COUNT(*) FROM diag_fundeb_vaar WHERE beneficiario IS TRUE) AS vaar_beneficiarios,
  now() AS atualizado_em;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diag_mv_radar_counts_singleton
  ON diag_mv_radar_counts(singleton_key);

GRANT SELECT ON diag_mv_radar_counts TO anon, authenticated, service_role;

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
