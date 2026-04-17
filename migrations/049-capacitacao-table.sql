-- 049: Documentação — tabela capacitacao
--
-- Tabela existe em alguns ambientes (criada via Dashboard).
-- O código trata sua ausência com try/catch ("tabela pode não existir").
-- Esta migration formaliza o schema para garantir consistência.
-- Padrão: CREATE TABLE IF NOT EXISTS — idempotente e segura.
--
-- Fonte: inferido do código em actions/cron-jobs.ts, actions/tutor-evidencia.ts,
-- dashboard/praticar/praticar-actions.ts

CREATE TABLE IF NOT EXISTS capacitacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id),
  semana INTEGER,
  tipo TEXT,
  evidencia_texto TEXT,
  pilula_ok BOOLEAN DEFAULT false,
  pontos INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS (permissiva — acompanha padrão atual)
ALTER TABLE capacitacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "capacitacao_permissive" ON capacitacao
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_capacitacao_colab
  ON capacitacao (colaborador_id, semana);
