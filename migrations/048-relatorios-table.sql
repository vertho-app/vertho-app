-- 048: Documentação — tabela relatorios
--
-- Tabela já existe em produção (criada via Dashboard). Esta migration
-- formaliza o schema no repositório para evitar drift.
-- Padrão: CREATE TABLE IF NOT EXISTS — idempotente e segura.
--
-- Fonte: inferido do código em actions/relatorios.ts, actions/fase5.ts
-- Unique constraint: (empresa_id, colaborador_id, tipo)

CREATE TABLE IF NOT EXISTS relatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  colaborador_id UUID REFERENCES colaboradores(id),
  tipo TEXT NOT NULL,
  conteudo JSONB,
  pdf_path TEXT,
  gerado_em TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (empresa_id, colaborador_id, tipo)
);

-- RLS (permissiva — acompanha padrão atual do projeto)
ALTER TABLE relatorios ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "relatorios_permissive" ON relatorios
  FOR ALL USING (true) WITH CHECK (true);

-- Índice para queries por tipo (frequente em dashboards)
CREATE INDEX IF NOT EXISTS idx_relatorios_empresa_tipo
  ON relatorios (empresa_id, tipo);
