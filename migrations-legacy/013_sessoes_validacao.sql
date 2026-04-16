-- 011: Adicionar campos de validação cruzada multi-LLM

ALTER TABLE sessoes_avaliacao
  ADD COLUMN IF NOT EXISTS rascunho_avaliacao JSONB,
  ADD COLUMN IF NOT EXISTS validacao_audit JSONB,
  ADD COLUMN IF NOT EXISTS modelo_avaliador TEXT,
  ADD COLUMN IF NOT EXISTS modelo_validador TEXT;
