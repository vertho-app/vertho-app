-- Migration 078 — ENEM por escola (microdados 2024+)
-- Agrega resultados dos participantes por código INEP da escola.

CREATE TABLE IF NOT EXISTS diag_enem_escola_snapshots (
  codigo_inep                         TEXT NOT NULL,
  ano                                 SMALLINT NOT NULL,
  municipio_ibge                      TEXT,
  municipio                           TEXT,
  uf                                  TEXT,
  dependencia_adm_code                SMALLINT,
  dependencia_adm                     TEXT,
  localizacao_code                    SMALLINT,
  localizacao                         TEXT,
  situacao_funcionamento_code         SMALLINT,
  participantes_total                 INT NOT NULL DEFAULT 0,
  participantes_com_objetiva          INT NOT NULL DEFAULT 0,
  participantes_com_redacao           INT NOT NULL DEFAULT 0,
  participantes_com_media_geral       INT NOT NULL DEFAULT 0,
  media_cn                            NUMERIC,
  media_ch                            NUMERIC,
  media_lc                            NUMERIC,
  media_mt                            NUMERIC,
  media_redacao                       NUMERIC,
  media_objetiva                      NUMERIC,
  media_geral                         NUMERIC,
  presenca_dist                       JSONB NOT NULL DEFAULT '{}',
  status_redacao_dist                 JSONB NOT NULL DEFAULT '{}',
  ingest_run_id                       UUID,
  atualizado_em                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (codigo_inep, ano)
);

CREATE INDEX IF NOT EXISTS idx_diag_enem_escola_ano
  ON diag_enem_escola_snapshots(ano DESC);

CREATE INDEX IF NOT EXISTS idx_diag_enem_escola_uf_ano
  ON diag_enem_escola_snapshots(uf, ano DESC);

CREATE INDEX IF NOT EXISTS idx_diag_enem_escola_municipio_ano
  ON diag_enem_escola_snapshots(municipio_ibge, ano DESC);

ALTER TABLE diag_enem_escola_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diag_enem_escola_public_read" ON diag_enem_escola_snapshots;
CREATE POLICY "diag_enem_escola_public_read"
  ON diag_enem_escola_snapshots
  FOR SELECT
  USING (true);
