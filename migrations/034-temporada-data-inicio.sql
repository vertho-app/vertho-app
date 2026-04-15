-- 034: gating temporal das semanas da temporada
-- Cada semana só libera na segunda-feira correspondente às 03:00 (America/Sao_Paulo).
-- data_inicio = segunda-feira da semana 1; semana N libera em data_inicio + (N-1)*7 dias.

ALTER TABLE trilhas
  ADD COLUMN IF NOT EXISTS data_inicio DATE;

-- Backfill: temporadas existentes recomeçam na próxima segunda-feira.
-- (acordado: ignora data de criação original)
UPDATE trilhas
SET data_inicio = (
  CURRENT_DATE + (((7 - EXTRACT(ISODOW FROM CURRENT_DATE)::int) % 7) + 1) * INTERVAL '1 day'
)::date
WHERE data_inicio IS NULL;

COMMENT ON COLUMN trilhas.data_inicio IS 'Segunda-feira (America/Sao_Paulo) em que a semana 1 fica liberada às 03:00. Semana N libera em data_inicio + (N-1)*7 dias às 03:00 BRT.';
