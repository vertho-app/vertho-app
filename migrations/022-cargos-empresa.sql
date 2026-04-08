-- Tabela de cargos por empresa (descrição, entregas, contexto para IA1)
CREATE TABLE IF NOT EXISTS cargos_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  area_depto TEXT,
  descricao TEXT,                    -- Descrição do cargo (responsabilidades)
  principais_entregas TEXT,          -- Principais entregas esperadas
  contexto_cultural TEXT,            -- Contexto cultural específico (opcional)
  stakeholders TEXT,                 -- Com quem interage (pares, superiores, clientes)
  decisoes_recorrentes TEXT,         -- Decisões típicas do cargo
  tensoes_comuns TEXT,               -- Situações difíceis / conflitos recorrentes
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, nome)
);

-- RLS
ALTER TABLE cargos_empresa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_full_cargos" ON cargos_empresa FOR ALL USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_cargos_empresa_empresa ON cargos_empresa(empresa_id);
