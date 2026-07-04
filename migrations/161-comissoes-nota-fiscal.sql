-- 161 — Comissões MVP 2: status de nota fiscal do representante
--
-- O ciclo de vida da comissão (forecast → accrued → paid + chargeback/cancelled)
-- já é suportado por sales_commission_events.status (mig 159). Falta o rastro da
-- NOTA FISCAL: o RC autônomo emite NF para receber a comissão devida ("a receber").
--
-- Modelo: invoice_number preenchido = NF emitida (invoice_issued_at carimba
-- quando). O admin/financeiro paga (status='paid', paid_at). Sem enum novo —
-- "emitida" deriva de invoice_issued_at NOT NULL.

ALTER TABLE sales_commission_events
  ADD COLUMN IF NOT EXISTS invoice_number   text,
  ADD COLUMN IF NOT EXISTS invoice_issued_at timestamptz;

-- Índice p/ a tela de financeiro (a receber sem NF, por RC).
CREATE INDEX IF NOT EXISTS idx_sales_commissions_invoice
  ON sales_commission_events (representante_id, status)
  WHERE status = 'accrued' AND invoice_issued_at IS NULL;
