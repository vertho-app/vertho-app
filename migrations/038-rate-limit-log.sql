-- 038: rate limit + telemetria IA
-- Tabela pra log de chamadas que devem ser ratelimitadas/monitoradas
-- (hoje: Tira-Dúvidas). Estrutura permite extensão.

CREATE TABLE IF NOT EXISTS ia_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,        -- 'tira_duvidas', 'evidencias', etc.
  trilha_id UUID,
  semana INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_usage_colab_feat ON ia_usage_log (colaborador_id, feature, created_at);
CREATE INDEX IF NOT EXISTS idx_ia_usage_empresa_created ON ia_usage_log (empresa_id, created_at);

ALTER TABLE ia_usage_log ENABLE ROW LEVEL SECURITY;
-- Só service role escreve/lê; RH/gestor não precisa ver isso no UI do cliente.

COMMENT ON TABLE ia_usage_log IS 'Log de chamadas IA pra rate-limit + telemetria de custo. Popula em endpoints conversacionais.';
