-- 235 — planejamentos persistentes do Copiloto PACE
--
-- O planejamento existe antes da conversa e precisa sobreviver ao navegador.
-- A ligação opcional com copilot_conversations forma o par planejamento → resultado.

CREATE TABLE IF NOT EXISTS copilot_plans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES sales_accounts(id) ON DELETE CASCADE,
  opportunity_id    uuid REFERENCES sales_opportunities(id) ON DELETE SET NULL,
  representante_id  uuid NOT NULL REFERENCES sales_representatives(id),
  conversation_id   uuid UNIQUE REFERENCES copilot_conversations(id) ON DELETE SET NULL,
  plan              jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  inputs            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(inputs) = 'object'),
  created_by_email  text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_plans_account_date
  ON copilot_plans (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_plans_rep_date
  ON copilot_plans (representante_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_plans_open
  ON copilot_plans (account_id, created_at DESC)
  WHERE conversation_id IS NULL;

ALTER TABLE copilot_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON copilot_plans FROM anon;
REVOKE ALL ON copilot_plans FROM authenticated;

DROP POLICY IF EXISTS copilot_plans_sem_acesso_direto ON copilot_plans;
CREATE POLICY copilot_plans_sem_acesso_direto
  ON copilot_plans
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE copilot_plans IS
  'Planejamentos PACE persistidos por conta. A aplicação valida acesso no servidor e liga cada plano ao resultado da reunião.';
COMMENT ON COLUMN copilot_plans.inputs IS
  'Entradas privadas usadas para reconstruir a próxima preparação: empresa, site, redes, contexto e oferta.';

NOTIFY pgrst, 'reload schema';

-- Rollback manual:
-- DROP TABLE IF EXISTS copilot_plans;
