-- ═════════════════════════════════════════════════════════════════
-- Migration 063 — SARESP (Sistema de Avaliação de Rendimento Escolar de SP)
-- Cobertura 2011-2025. ~5.500 escolas estaduais SP + redes que aderem.
-- Granularidade: (escola, ano, série, disciplina).
-- ═════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS diag_saresp_snapshots (
  codigo_inep         TEXT NOT NULL,
  ano                 SMALLINT NOT NULL,
  serie               SMALLINT NOT NULL,           -- 3, 5, 7, 9 (EF) ou 12 (EM/3º EM)
  disciplina          TEXT NOT NULL,               -- 'lp', 'mat', 'cn', 'ch'
  proficiencia_media  NUMERIC,
  -- Distribuição por nível: { abaixo_basico, basico, adequado, avancado }
  distribuicao_niveis JSONB DEFAULT '{}',
  total_alunos        INT,
  ingest_run_id       UUID,
  atualizado_em       TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (codigo_inep, ano, serie, disciplina)
);

CREATE INDEX IF NOT EXISTS idx_diag_saresp_inep ON diag_saresp_snapshots(codigo_inep);
CREATE INDEX IF NOT EXISTS idx_diag_saresp_ano  ON diag_saresp_snapshots(ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_saresp_disc ON diag_saresp_snapshots(ano, serie, disciplina);

ALTER TABLE diag_saresp_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diag_saresp_public_read" ON diag_saresp_snapshots;
CREATE POLICY "diag_saresp_public_read" ON diag_saresp_snapshots FOR SELECT USING (true);
