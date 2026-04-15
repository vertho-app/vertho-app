-- 036: Tira-Dúvidas — chat conversacional independente do fluxo de evidências.
-- Persiste transcript em campo separado pra não contaminar o Evolution Report.

ALTER TABLE temporada_semana_progresso
  ADD COLUMN IF NOT EXISTS tira_duvidas JSONB;

COMMENT ON COLUMN temporada_semana_progresso.tira_duvidas IS 'Transcript do chat Tira-Dúvidas. Shape: { transcript_completo: [{role,content,timestamp}] }. Sem limite de turnos e não altera status da semana.';
