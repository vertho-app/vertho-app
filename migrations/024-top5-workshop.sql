-- Adicionar coluna top5_workshop à tabela cargos_empresa
ALTER TABLE cargos_empresa ADD COLUMN IF NOT EXISTS top5_workshop JSONB DEFAULT '[]';
