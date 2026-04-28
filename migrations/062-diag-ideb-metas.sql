-- ═════════════════════════════════════════════════════════════════
-- Migration 062 — Ideb projetado vs realizado
-- Metas oficiais INEP só existem até 2021 (último ciclo). 2023+ não
-- têm meta projetada (INEP criou GT "Novo Ideb"). Mostramos a última
-- comparação oficial.
-- ═════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS diag_ideb_metas (
  codigo_inep      TEXT NOT NULL,
  ano              SMALLINT NOT NULL,
  etapa            TEXT NOT NULL,                  -- 'AI' | 'AF' | 'EM'
  meta_projetada   NUMERIC,
  ideb_realizado   NUMERIC,
  status           TEXT GENERATED ALWAYS AS (
    CASE
      WHEN meta_projetada IS NULL OR ideb_realizado IS NULL THEN 'sem_dado'
      WHEN ideb_realizado >= meta_projetada + 0.3 THEN 'superou'
      WHEN ideb_realizado >= meta_projetada THEN 'atingiu'
      ELSE 'abaixo'
    END
  ) STORED,
  ingest_run_id    UUID,
  atualizado_em    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (codigo_inep, ano, etapa)
);

CREATE INDEX IF NOT EXISTS idx_diag_ideb_inep ON diag_ideb_metas(codigo_inep);
CREATE INDEX IF NOT EXISTS idx_diag_ideb_ano  ON diag_ideb_metas(ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_ideb_status ON diag_ideb_metas(status);

ALTER TABLE diag_ideb_metas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diag_ideb_public_read" ON diag_ideb_metas;
CREATE POLICY "diag_ideb_public_read" ON diag_ideb_metas FOR SELECT USING (true);
