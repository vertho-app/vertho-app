-- Fase 4 Reavaliação: sessões conversacionais + cenários B

-- Coluna tipo_cenario em banco_cenarios (diferenciar A de B)
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS tipo_cenario TEXT DEFAULT NULL;

-- Coluna tipo_resposta em respostas (diferenciar cenário A de B)
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS tipo_resposta TEXT DEFAULT NULL;

-- Tabela de sessões de reavaliação conversacional
CREATE TABLE IF NOT EXISTS reavaliacao_sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  competencia_id UUID NOT NULL REFERENCES competencias(id) ON DELETE CASCADE,
  cenario_b_id UUID REFERENCES banco_cenarios(id),
  baseline_nivel INTEGER,
  baseline_avaliacao JSONB,
  status TEXT DEFAULT 'pendente',
  historico JSONB DEFAULT '[]'::jsonb,
  turno INTEGER DEFAULT 0,
  extracao_qualitativa JSONB,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reav_sessoes_empresa ON reavaliacao_sessoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_reav_sessoes_colab ON reavaliacao_sessoes(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_reav_sessoes_status ON reavaliacao_sessoes(status);
