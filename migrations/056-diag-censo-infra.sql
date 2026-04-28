-- ═════════════════════════════════════════════════════════════════
-- Migration 056 — Censo Escolar Infra
-- Tabela complementar a diag_escolas com dados de infra-estrutura do
-- Censo Escolar INEP (213 indicadores IN_* + 32 quantidades QT_* +
-- 4 scores agregados pra UX rápida).
-- ═════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS diag_censo_infra (
  codigo_inep      TEXT NOT NULL,
  ano              SMALLINT NOT NULL,
  -- Identificação extra (não em diag_escolas)
  situacao_funcionamento TEXT,           -- 1=ativa, 2=paralisada, 3=extinta, 4=transferida
  zona_localizacao TEXT,                 -- URBANA / RURAL
  zona_diferenciada TEXT,
  latitude         NUMERIC(10,7),
  longitude        NUMERIC(10,7),
  endereco         TEXT,
  bairro           TEXT,
  cep              TEXT,
  -- Raw data (213 IN_ binários + 32 QT_ quantitativos)
  indicadores      JSONB NOT NULL DEFAULT '{}',
  quantidades      JSONB NOT NULL DEFAULT '{}',
  -- Scores agregados 0-100 (calculados na ingestão)
  score_basica         NUMERIC(5,2),     -- água, luz, esgoto, banheiro
  score_pedagogica     NUMERIC(5,2),     -- biblioteca, lab, sala leitura
  score_acessibilidade NUMERIC(5,2),     -- rampas, sinais, profissional
  score_conectividade  NUMERIC(5,2),     -- internet, banda larga
  -- Audit
  ingest_run_id    UUID,
  atualizado_em    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (codigo_inep, ano)
);

CREATE INDEX IF NOT EXISTS idx_diag_censo_inep ON diag_censo_infra(codigo_inep);
CREATE INDEX IF NOT EXISTS idx_diag_censo_ano  ON diag_censo_infra(ano DESC);

ALTER TABLE diag_censo_infra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diag_censo_public_read" ON diag_censo_infra FOR SELECT USING (true);
