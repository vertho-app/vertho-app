-- Votação de competências pelos colaboradores
-- Cada colaborador escolhe e ordena 5 competências do seu cargo por prioridade
CREATE TABLE IF NOT EXISTS votacao_competencias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  colaborador_id UUID NOT NULL,
  cargo TEXT NOT NULL,
  competencias_escolhidas JSONB NOT NULL DEFAULT '[]',
  sugestao_nova TEXT,
  votado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, colaborador_id)
);

-- RLS permissivo (admin bypass via service role)
ALTER TABLE votacao_competencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "votacao_competencias_all" ON votacao_competencias FOR ALL USING (true) WITH CHECK (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_votacao_comp_empresa ON votacao_competencias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_votacao_comp_cargo ON votacao_competencias(empresa_id, cargo);
