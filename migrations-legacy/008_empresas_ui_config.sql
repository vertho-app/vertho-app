-- 008: UI dinâmica por tenant — coluna ui_config na tabela empresas
-- Permite ocultar botões e renomear labels por empresa

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS ui_config JSONB DEFAULT '{"hidden_elements": [], "labels": {}}'::jsonb;
