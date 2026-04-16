-- Lixeira centralizada: ao invés de soft delete por tabela, dump da linha
-- inteira em JSONB. Restaura via INSERT inverso.
CREATE TABLE IF NOT EXISTS trash (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  tabela_origem TEXT NOT NULL,
  registro_id UUID,
  payload JSONB NOT NULL,
  deletado_em TIMESTAMPTZ DEFAULT now(),
  deletado_por TEXT,
  contexto TEXT  -- ex: "Limpar Avaliações IA4 (empresa)"
);

CREATE INDEX IF NOT EXISTS idx_trash_empresa ON trash(empresa_id, deletado_em DESC);
CREATE INDEX IF NOT EXISTS idx_trash_tabela ON trash(tabela_origem);

ALTER TABLE trash ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trash_service_all ON trash;
CREATE POLICY trash_service_all ON trash FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE trash IS 'Lixeira centralizada — Limpar Registros move pra cá em vez de DELETE direto. Restauração via INSERT inverso usando payload.';
