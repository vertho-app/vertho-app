-- 174: 2 competências foco por cargo (para trilha DUO, o padrão).
-- Fonte ÚNICA que o PDI e a trilha leem — garante coerência PDI↔trilha
-- independente da ordem de geração (Fase 0, item D).
-- Antes só havia `competencia_foco` (single, mig 030).

ALTER TABLE cargos_empresa ADD COLUMN IF NOT EXISTS competencias_foco TEXT[];

-- Backfill: promove a foco single existente para o array (backward-compat).
UPDATE cargos_empresa
   SET competencias_foco = ARRAY[competencia_foco]
 WHERE competencia_foco IS NOT NULL
   AND (competencias_foco IS NULL OR array_length(competencias_foco, 1) IS NULL);

NOTIFY pgrst, 'reload schema';
