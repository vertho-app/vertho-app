-- 051: Adiciona coluna faltante em capacitacao
--
-- O código em actions/tutor-evidencia.ts faz:
--   .update({ evidencia_avaliacao: avaliacao, ... })
-- onde avaliacao é um objeto JSON com feedback, pontos_total, etc.
--
-- A migration 049 não incluiu esta coluna.

ALTER TABLE capacitacao ADD COLUMN IF NOT EXISTS evidencia_avaliacao JSONB;
