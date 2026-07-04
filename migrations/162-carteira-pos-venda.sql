-- 162 — Carteira/pós-venda (MVP 3): acompanhamento, expansão e follow-up
--
-- A carteira (clientes ativos + fase 12%/6% + churn_risk + renewal_date) já
-- existe. O MVP 3 acrescenta a gestão PÓS-VENDA:
--   • expansion_potential — RC sinaliza conta com potencial de expansão/upsell.
--   • next_followup_date  — próxima ação comercial na conta (agenda leve).
--   • sales_activity_notes.kind — categoriza o histórico (nota/follow-up/
--     renovação/risco/expansão) para a timeline da conta.

ALTER TABLE sales_accounts
  ADD COLUMN IF NOT EXISTS expansion_potential boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_followup_date  date;

ALTER TABLE sales_activity_notes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'nota'
    CHECK (kind IN ('nota','followup','renovacao','risco','expansao'));

-- Renovações próximas por RC (tela de carteira).
CREATE INDEX IF NOT EXISTS idx_sales_accounts_renewal
  ON sales_accounts (representante_id, renewal_date)
  WHERE status = 'active_client' AND renewal_date IS NOT NULL;
