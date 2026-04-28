-- ═════════════════════════════════════════════════════════════════
-- Migration 064 — FUNDEB (Fundo de Manutenção e Desenvolvimento da
-- Educação Básica e de Valorização dos Profissionais da Educação)
-- Cobertura: 5.570 municípios + DF + estados. Fonte: Tesouro Transparente.
-- ═════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS diag_fundeb_repasses (
  municipio_ibge              TEXT NOT NULL,        -- 7 dígitos IBGE
  uf                          TEXT,
  ano                         SMALLINT NOT NULL,
  total_repasse_bruto         NUMERIC,
  total_complementacao_uniao  NUMERIC,
  matriculas_consideradas     INT,
  valor_aluno_ano             NUMERIC GENERATED ALWAYS AS (
    CASE WHEN matriculas_consideradas > 0
      THEN (COALESCE(total_repasse_bruto, 0) / matriculas_consideradas)
      ELSE NULL
    END
  ) STORED,
  ingest_run_id               UUID,
  atualizado_em               TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (municipio_ibge, ano)
);

CREATE INDEX IF NOT EXISTS idx_diag_fundeb_uf  ON diag_fundeb_repasses(uf);
CREATE INDEX IF NOT EXISTS idx_diag_fundeb_ano ON diag_fundeb_repasses(ano DESC);

ALTER TABLE diag_fundeb_repasses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diag_fundeb_public_read" ON diag_fundeb_repasses;
CREATE POLICY "diag_fundeb_public_read" ON diag_fundeb_repasses FOR SELECT USING (true);
