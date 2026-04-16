-- 019: Colunas para Check IA4 (validação de qualidade 4D × 25pts)

ALTER TABLE sessoes_avaliacao
  ADD COLUMN IF NOT EXISTS check_nota INT,
  ADD COLUMN IF NOT EXISTS check_status TEXT CHECK (check_status IN ('aprovado', 'revisar')),
  ADD COLUMN IF NOT EXISTS check_resultado JSONB;
