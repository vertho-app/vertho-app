-- Respostas dos colaboradores aos cenários (4 perguntas por cenário)
CREATE TABLE IF NOT EXISTS respostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  competencia_id UUID REFERENCES competencias(id) ON DELETE CASCADE,
  cenario_id UUID REFERENCES banco_cenarios(id) ON DELETE SET NULL,
  r1 TEXT,                          -- Resposta à P1
  r2 TEXT,                          -- Resposta à P2
  r3 TEXT,                          -- Resposta à P3
  r4 TEXT,                          -- Resposta à P4
  nivel_simulado SMALLINT,          -- Se foi simulado, qual nível alvo
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, colaborador_id, competencia_id)
);

ALTER TABLE respostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_full_respostas" ON respostas FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_respostas_empresa ON respostas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_respostas_colab ON respostas(colaborador_id);
