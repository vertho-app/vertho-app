-- Auditoria de coerência do Development Blueprint (Fase 1, Estágio 4).
-- Guarda o último relatório de auditoria (estrutural + 2ª IA) junto do blueprint:
-- `auditoria` = JSON de `lib/blueprint/audit.ts::BlueprintAuditReport` (checks,
-- drift, score, resumo); `auditado_em` = quando rodou. Aditivo e idempotente —
-- não afeta geração nem consumo do blueprint. Nulo enquanto não auditado.
ALTER TABLE IF EXISTS public.development_blueprints
  ADD COLUMN IF NOT EXISTS auditoria   jsonb,
  ADD COLUMN IF NOT EXISTS auditado_em timestamptz;

NOTIFY pgrst, 'reload schema';
