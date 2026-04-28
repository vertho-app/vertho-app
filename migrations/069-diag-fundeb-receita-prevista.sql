-- ═════════════════════════════════════════════════════════════════
-- Migration 069 — FUNDEB · Receita prevista por ente federado
-- Anual, da Portaria Interministerial. Decompõe a receita do FUNDEB
-- em contribuição estadual/municipal + 3 complementações da União
-- (VAAF, VAAT, VAAR). É a contraparte "previsto" do diag_fundeb_repasses
-- (que guarda repasses executados mensalmente pelo Tesouro).
-- Fonte: FNDE / Portaria Interministerial.
-- ═════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS diag_fundeb_receita_prevista (
  municipio_ibge                TEXT NOT NULL,    -- 7 dígitos IBGE
  uf                            TEXT,
  entidade                      TEXT,
  ano                           SMALLINT NOT NULL,
  receita_contribuicao          NUMERIC,          -- contribuição est./mun. ao Fundeb
  complementacao_vaaf           NUMERIC,          -- Valor Aluno-Ano Fundeb
  complementacao_vaat           NUMERIC,          -- Valor Aluno-Ano Total
  complementacao_vaar           NUMERIC,          -- Valor Aluno-Ano por Resultado
  complementacao_uniao_total    NUMERIC,          -- VAAF + VAAT + VAAR
  total_receita_prevista        NUMERIC,          -- contribuição + complementação
  ingest_run_id                 UUID,
  atualizado_em                 TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (municipio_ibge, ano)
);

CREATE INDEX IF NOT EXISTS idx_diag_fundeb_rec_uf  ON diag_fundeb_receita_prevista(uf);
CREATE INDEX IF NOT EXISTS idx_diag_fundeb_rec_ano ON diag_fundeb_receita_prevista(ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_fundeb_rec_vaar
  ON diag_fundeb_receita_prevista(complementacao_vaar)
  WHERE complementacao_vaar > 0;

ALTER TABLE diag_fundeb_receita_prevista ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diag_fundeb_rec_public_read" ON diag_fundeb_receita_prevista;
CREATE POLICY "diag_fundeb_rec_public_read"
  ON diag_fundeb_receita_prevista FOR SELECT USING (true);
