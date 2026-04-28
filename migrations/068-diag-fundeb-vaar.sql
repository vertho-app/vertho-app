-- ═════════════════════════════════════════════════════════════════
-- Migration 068 — FUNDEB VAAR (Valor Aluno-Ano por Resultado)
-- Lista anual do FNDE de entes (municípios e estados) habilitados ou
-- não a receber a complementação-resultado da União ao FUNDEB,
-- conforme Lei nº 14.113/2020, art. 14, §1º (incisos I a V) e
-- evolução nos indicadores de Atendimento e Aprendizagem.
-- Fonte: FNDE (XLSX anual).
-- ═════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS diag_fundeb_vaar (
  municipio_ibge          TEXT NOT NULL,         -- 7 dígitos IBGE
  uf                      TEXT,
  entidade                TEXT,                  -- nome do município conforme FNDE
  ano                     SMALLINT NOT NULL,
  cond_i                  BOOLEAN,
  cond_ii                 BOOLEAN,
  cond_iii                BOOLEAN,
  cond_iv                 BOOLEAN,
  cond_v                  BOOLEAN,
  habilitado              BOOLEAN,               -- cumpriu todas as 5 condições legais
  evoluiu_atendimento     BOOLEAN,
  evoluiu_aprendizagem    BOOLEAN,
  beneficiario            BOOLEAN,               -- recebe a complementação no ano
  pendencia               TEXT,                  -- texto livre da pendência (FNDE)
  ingest_run_id           UUID,
  atualizado_em           TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (municipio_ibge, ano)
);

CREATE INDEX IF NOT EXISTS idx_diag_vaar_uf           ON diag_fundeb_vaar(uf);
CREATE INDEX IF NOT EXISTS idx_diag_vaar_ano          ON diag_fundeb_vaar(ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_vaar_beneficiario ON diag_fundeb_vaar(beneficiario)
  WHERE beneficiario IS TRUE;

ALTER TABLE diag_fundeb_vaar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diag_vaar_public_read" ON diag_fundeb_vaar;
CREATE POLICY "diag_vaar_public_read" ON diag_fundeb_vaar FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────────
-- Atualiza o MV de contagens para incluir VAAR (substitui v067).
-- ─────────────────────────────────────────────────────────────────

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
