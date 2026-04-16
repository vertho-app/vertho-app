-- 024: Leitura executiva LLM para o Fit v2
--
-- Adiciona uma coluna dedicada para guardar a versão LLM da leitura executiva.
-- Mantém `leitura_executiva` (texto determinístico) como fallback/default.
-- `leitura_executiva_ai_at` serve pra invalidar cache quando necessário.

ALTER TABLE fit_resultados
  ADD COLUMN IF NOT EXISTS leitura_executiva_ai TEXT,
  ADD COLUMN IF NOT EXISTS leitura_executiva_ai_at TIMESTAMPTZ;
