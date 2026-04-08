-- Banco de cenários gerados pela IA3
CREATE TABLE IF NOT EXISTS banco_cenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  competencia_id UUID REFERENCES competencias(id) ON DELETE CASCADE,
  cargo TEXT,
  titulo TEXT,
  descricao TEXT,
  alternativas JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE banco_cenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_full_cenarios" ON banco_cenarios FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_cenarios_empresa ON banco_cenarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cenarios_empresa_comp_cargo ON banco_cenarios(empresa_id, competencia_id, cargo);
