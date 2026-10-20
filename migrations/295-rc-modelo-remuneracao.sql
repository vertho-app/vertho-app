-- 295: modelo de remuneração por representante comercial (RC).
--
-- Dois modelos (decisão do dono, 08/10 e 19/10/2026):
--   sem_ajuda: aquisição 9% (inteira no 1º pagamento) + recorrente 12% na
--              vigência inicial; renovação 6%; expansão 9% + 12%.
--   com_ajuda: recorrente 10% ao mês + ajuda de custo (fora do portal); sem
--              aquisição; renovação 5%; expansão 10% ao mês do incremental.
-- As taxas vivem no código (lib/sales/constants.ts, commissionRatesFor); a
-- coluna só diz qual modelo vale para cada RC. Padrão 'sem_ajuda': os RCs que
-- já existem continuam exatamente como estão.
--
-- Idempotente: pode ser reaplicada.

ALTER TABLE public.sales_representatives
  ADD COLUMN IF NOT EXISTS compensation_model text NOT NULL DEFAULT 'sem_ajuda';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_representatives_compensation_model_check'
      AND conrelid = 'public.sales_representatives'::regclass
  ) THEN
    ALTER TABLE public.sales_representatives
      ADD CONSTRAINT sales_representatives_compensation_model_check
      CHECK (compensation_model IN ('sem_ajuda', 'com_ajuda'));
  END IF;
END $$;

COMMENT ON COLUMN public.sales_representatives.compensation_model IS
  'Modelo de remuneração do RC: sem_ajuda (aquisição 9% + recorrente 12%, renovação 6%) ou com_ajuda (recorrente 10% + ajuda de custo, sem aquisição, renovação 5%). Taxas em lib/sales/constants.ts (commissionRatesFor). Mig 295, 19/10/2026.';

-- Rollback (se precisar):
-- ALTER TABLE public.sales_representatives DROP CONSTRAINT IF EXISTS sales_representatives_compensation_model_check;
-- ALTER TABLE public.sales_representatives DROP COLUMN IF EXISTS compensation_model;
