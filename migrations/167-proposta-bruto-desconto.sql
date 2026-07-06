-- 167 — Persiste o detalhamento financeiro da proposta
--
-- calculateProposalFinancials passou a devolver o valor bruto e o desconto em
-- R$ (além do valor final). A action grava o financeiro inteiro (...fin), então
-- essas duas colunas precisam existir.
ALTER TABLE sales_proposals
  ADD COLUMN IF NOT EXISTS contract_value_gross numeric,
  ADD COLUMN IF NOT EXISTS discount_amount      numeric;
