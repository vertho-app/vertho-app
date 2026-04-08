-- Top 10 competências selecionadas por cargo (resultado da IA1)
CREATE TABLE IF NOT EXISTS top10_cargos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cargo TEXT NOT NULL,
  competencia_id UUID NOT NULL REFERENCES competencias(id) ON DELETE CASCADE,
  posicao SMALLINT,                  -- 1-10
  justificativa TEXT,                -- por que a IA selecionou
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, cargo, competencia_id)
);

ALTER TABLE top10_cargos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_full_top10" ON top10_cargos FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_top10_empresa_cargo ON top10_cargos(empresa_id, cargo);
