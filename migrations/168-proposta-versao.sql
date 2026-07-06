-- 168 — Versionamento de proposta (revisar e reenviar)
--
-- Depois de enviada/aprovada, o RC pode criar uma NOVA VERSÃO ajustada (cópia
-- editável, novo número -Rn). A original vira 'superseded' (histórico).
--   • version       — nº da versão (1 = original).
--   • supersedes_id — proposta que esta versão substitui.
--   • status 'superseded' — original que foi revisada.

ALTER TABLE sales_proposals
  ADD COLUMN IF NOT EXISTS version       integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_id uuid REFERENCES sales_proposals(id);

-- Adiciona 'superseded' ao CHECK de status (drop robusto + recria).
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
   WHERE conrelid = 'sales_proposals'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%' AND pg_get_constraintdef(oid) ILIKE '%draft%';
  IF cname IS NOT NULL THEN EXECUTE format('ALTER TABLE sales_proposals DROP CONSTRAINT %I', cname); END IF;
END $$;

ALTER TABLE sales_proposals ADD CONSTRAINT sales_proposals_status_check
  CHECK (status IN ('draft','submitted_for_approval','approved','changes_requested',
    'rejected','sent_to_client','accepted','lost','superseded'));
