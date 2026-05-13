-- ============================================================================
-- 091: Trilha multi-competência (suporte ao Modo Onboarding — Fase 2)
-- ============================================================================
--
-- Hoje `trilhas.competencia_foco TEXT` armazena 1 competência aprofundada
-- (programa regular). Modo Onboarding precisa de até 5 competências cobertas
-- em espiral por trilha. Solução: adicionar coluna paralela `competencias_foco
-- TEXT[]` e fazer backfill = ARRAY[competencia_foco].
--
-- Estratégia de compatibilidade:
--   * `competencia_foco` permanece (compat com Fase 1 + todos os callers atuais).
--   * `competencias_foco` é a fonte de verdade do Onboarding e da Fase 3.
--   * Triggers / lógica não são alterados nesta migration — só schema.
--
-- A engine (`actions/temporadas.ts`) só lê `competencias_foco` quando entrar
-- em multi-competência (Fase 3). Até lá, o backfill garante consistência.
--
-- Reversível: DROP COLUMN trilhas.competencias_foco;
-- ============================================================================

ALTER TABLE trilhas
  ADD COLUMN IF NOT EXISTS competencias_foco TEXT[] DEFAULT NULL;

-- Backfill: existentes ganham array unitário com a competência atual
UPDATE trilhas
  SET competencias_foco = ARRAY[competencia_foco]
  WHERE competencias_foco IS NULL AND competencia_foco IS NOT NULL;

-- Comentário documentando o contrato
COMMENT ON COLUMN trilhas.competencias_foco IS
'Array de competências da trilha. Regular = 1 (= ARRAY[competencia_foco]).
Onboarding = até 5 (espiral). Default NULL para trilhas pré-Fase 2;
backfill = ARRAY[competencia_foco]. Fonte de verdade da engine multi-competência (Fase 3).';
