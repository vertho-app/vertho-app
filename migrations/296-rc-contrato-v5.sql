-- 296: portal do RC alinhado ao contrato de representação comercial (v5, 22/10/2026).
--
-- O contrato (Lei 4.886/65) passou a ser a régua do canal. Três mudanças de
-- schema, todas aditivas:
--
--   1. VALIDAÇÃO DO REGISTRO (cláusulas 7.1, 7.3 e 7.5). Só é comissionável a
--      oportunidade que a vertho.ai ACEITA como atribuída, e os 90 dias de
--      proteção contam desse aceite. Decisão do dono (22/10): fila de validação
--      no /admin/comercial. As oportunidades que já existem ficam 'validada'
--      (elas já tinham proteção correndo); as novas nascem 'aguardando', pelo
--      DEFAULT, então um caminho de inserção que esqueça o campo cai na fila e
--      não ganha proteção sozinho.
--
--   2. A PROPOSTA GUARDA AS PRÓPRIAS REGRAS DE COMISSÃO.
--      · compensation_model: o modelo do RC na APROVAÇÃO (10.5: "se aplica às
--        propostas aprovadas pela VERTHO durante sua vigência"). Antes o aceite
--        lia o modelo do RC no dia do aceite.
--      · carteira: cliente da carteira do RC (10.6) paga 50% dos percentuais.
--        Calculada sozinha (a conta já tem proposta aceita do mesmo RC) e
--        conferida pelo admin na aprovação, que é quem enxerga grupo econômico
--        e mantenedora.
--      · sent_to_client_at: a 18.7 mantém a comissão das propostas ENVIADAS
--        antes do término do contrato do RC e aceitas dentro da validade.
--
--   3. sales_representatives.contract_ended_at: data de término do contrato do
--      RC, gravada quando o admin o desativa (18.7).
--
-- Idempotente: pode ser reaplicada.

-- ── 1) Validação do registro da oportunidade ────────────────────────────────

ALTER TABLE public.sales_opportunities
  ADD COLUMN IF NOT EXISTS attribution_status text NOT NULL DEFAULT 'validada';
-- Depois do preenchimento das linhas existentes, o padrão passa a ser 'aguardando'.
ALTER TABLE public.sales_opportunities ALTER COLUMN attribution_status SET DEFAULT 'aguardando';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_opportunities_attribution_status_check'
      AND conrelid = 'public.sales_opportunities'::regclass
  ) THEN
    ALTER TABLE public.sales_opportunities
      ADD CONSTRAINT sales_opportunities_attribution_status_check
      CHECK (attribution_status IN ('aguardando', 'validada', 'recusada'));
  END IF;
END $$;

ALTER TABLE public.sales_opportunities ADD COLUMN IF NOT EXISTS attribution_decided_at timestamptz;
ALTER TABLE public.sales_opportunities ADD COLUMN IF NOT EXISTS attribution_decided_by text;
ALTER TABLE public.sales_opportunities ADD COLUMN IF NOT EXISTS attribution_note text;

CREATE INDEX IF NOT EXISTS idx_sales_opportunities_attribution
  ON public.sales_opportunities (attribution_status);

COMMENT ON COLUMN public.sales_opportunities.attribution_status IS
  'Validação do registro pela vertho.ai (contrato do RC, cláusulas 7.1, 7.3 e 7.5): aguardando (validação), validada (atribuída ao RC; a proteção de 90 dias conta da validação) ou recusada. Mig 296, 22/10/2026.';
COMMENT ON COLUMN public.sales_opportunities.attribution_decided_at IS
  'Quando a vertho.ai validou ou recusou o registro (mig 296).';
COMMENT ON COLUMN public.sales_opportunities.attribution_decided_by IS
  'E-mail do admin que validou ou recusou o registro (mig 296).';
COMMENT ON COLUMN public.sales_opportunities.attribution_note IS
  'Motivo da recusa, ou observação da validação, que o RC lê (mig 296).';

-- ── 2) Regras de comissão gravadas na proposta ──────────────────────────────

ALTER TABLE public.sales_proposals ADD COLUMN IF NOT EXISTS compensation_model text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_proposals_compensation_model_check'
      AND conrelid = 'public.sales_proposals'::regclass
  ) THEN
    ALTER TABLE public.sales_proposals
      ADD CONSTRAINT sales_proposals_compensation_model_check
      CHECK (compensation_model IS NULL OR compensation_model IN ('sem_ajuda', 'com_ajuda'));
  END IF;
END $$;

ALTER TABLE public.sales_proposals ADD COLUMN IF NOT EXISTS carteira boolean NOT NULL DEFAULT false;
ALTER TABLE public.sales_proposals ADD COLUMN IF NOT EXISTS carteira_motivo text;
ALTER TABLE public.sales_proposals ADD COLUMN IF NOT EXISTS sent_to_client_at timestamptz;

-- As propostas de RC que já existem herdam o modelo atual do RC (todos
-- 'sem_ajuda' em 22/10/2026). Proposta do deal desk (sem RC) fica NULL.
UPDATE public.sales_proposals p
   SET compensation_model = r.compensation_model
  FROM public.sales_representatives r
 WHERE p.representante_id = r.id
   AND p.compensation_model IS NULL;

COMMENT ON COLUMN public.sales_proposals.compensation_model IS
  'Modelo de remuneração que vale para esta proposta: o do RC na APROVAÇÃO (contrato, cláusula 10.5). Antes da aprovação é a estimativa com o modelo atual do RC. NULL = proposta do deal desk, sem RC. Mig 296.';
COMMENT ON COLUMN public.sales_proposals.carteira IS
  'Cliente da carteira do RC (contrato, cláusula 10.6): paga 50% dos percentuais do modelo. Calculada sozinha (a conta já tem proposta aceita do mesmo RC) e conferida pelo admin na aprovação. Mig 296.';
COMMENT ON COLUMN public.sales_proposals.carteira_motivo IS
  'Por que a proposta é (ou não é) de cliente da carteira: a regra automática ou a observação do admin (grupo econômico, mantenedora). Mig 296.';
COMMENT ON COLUMN public.sales_proposals.sent_to_client_at IS
  'Quando o RC marcou a proposta como enviada ao cliente. A cláusula 18.7 mantém a comissão das propostas enviadas antes do término do contrato do RC e aceitas dentro da validade. Mig 296.';

-- ── 3) Término do contrato do RC ────────────────────────────────────────────

ALTER TABLE public.sales_representatives ADD COLUMN IF NOT EXISTS contract_ended_at timestamptz;

-- RC já inativo antes desta migration: a última atualização é o melhor registro.
UPDATE public.sales_representatives
   SET contract_ended_at = updated_at
 WHERE status = 'inactive'
   AND contract_ended_at IS NULL;

COMMENT ON COLUMN public.sales_representatives.contract_ended_at IS
  'Término do contrato de representação (gravado quando o admin desativa o RC). Cláusula 18.7: depois dele só geram comissão as propostas aceitas antes, ou enviadas antes e aceitas dentro da validade. Mig 296.';

-- O comentário da mig 295 ainda descrevia as taxas de 19/10.
COMMENT ON COLUMN public.sales_representatives.compensation_model IS
  'Modelo de remuneração do RC (contrato v5, cláusula 10ª): sem_ajuda (aquisição 8% sobre o contrato limitada aos 12 primeiros meses + 10% por parcela paga a partir da 2ª) ou com_ajuda (ajuda de custo fixa fora do portal + 10% por parcela paga, sem aquisição). Cliente da carteira paga 50%. Taxas em lib/sales/constants.ts (commissionRatesFor). Mig 295, revisto na 296.';

-- Rollback (se precisar):
-- ALTER TABLE public.sales_representatives DROP COLUMN IF EXISTS contract_ended_at;
-- ALTER TABLE public.sales_proposals DROP COLUMN IF EXISTS sent_to_client_at;
-- ALTER TABLE public.sales_proposals DROP COLUMN IF EXISTS carteira_motivo;
-- ALTER TABLE public.sales_proposals DROP COLUMN IF EXISTS carteira;
-- ALTER TABLE public.sales_proposals DROP CONSTRAINT IF EXISTS sales_proposals_compensation_model_check;
-- ALTER TABLE public.sales_proposals DROP COLUMN IF EXISTS compensation_model;
-- DROP INDEX IF EXISTS public.idx_sales_opportunities_attribution;
-- ALTER TABLE public.sales_opportunities DROP COLUMN IF EXISTS attribution_note;
-- ALTER TABLE public.sales_opportunities DROP COLUMN IF EXISTS attribution_decided_by;
-- ALTER TABLE public.sales_opportunities DROP COLUMN IF EXISTS attribution_decided_at;
-- ALTER TABLE public.sales_opportunities DROP CONSTRAINT IF EXISTS sales_opportunities_attribution_status_check;
-- ALTER TABLE public.sales_opportunities DROP COLUMN IF EXISTS attribution_status;
