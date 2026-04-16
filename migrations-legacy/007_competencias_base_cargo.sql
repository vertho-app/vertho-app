-- 007: Adicionar campo cargo na tabela competencias_base
ALTER TABLE competencias_base ADD COLUMN IF NOT EXISTS cargo TEXT;
