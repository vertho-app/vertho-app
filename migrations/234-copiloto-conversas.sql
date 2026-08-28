-- 234 — memória comercial persistente do Copiloto PACE
--
-- Uma conversa é um evento imutável ligado à conta e, quando houver, à
-- oportunidade. A transcrição não cabe em sales_activity_notes: além de longa,
-- ela precisa manter origem, data, análise PACE e evolução estruturada.
-- sales_activity_notes recebe apenas um resumo curto para o CRM continuar com
-- uma timeline única e legível.

CREATE TABLE IF NOT EXISTS copilot_conversations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES sales_accounts(id) ON DELETE CASCADE,
  opportunity_id    uuid REFERENCES sales_opportunities(id) ON DELETE SET NULL,
  representante_id  uuid NOT NULL REFERENCES sales_representatives(id),
  title             text NOT NULL,
  happened_at       timestamptz NOT NULL DEFAULT now(),
  source            text NOT NULL DEFAULT 'paste'
                    CHECK (source IN ('paste', 'whisper_local', 'supernormal', 'manual')),
  transcript        text NOT NULL,
  summary           text NOT NULL DEFAULT '',
  analysis          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_email  text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_account_date
  ON copilot_conversations (account_id, happened_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_opportunity
  ON copilot_conversations (opportunity_id, happened_at DESC)
  WHERE opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_rep
  ON copilot_conversations (representante_id, happened_at DESC);

ALTER TABLE copilot_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON copilot_conversations FROM anon;
REVOKE ALL ON copilot_conversations FROM authenticated;

DROP POLICY IF EXISTS copilot_conversations_sem_acesso_direto ON copilot_conversations;
CREATE POLICY copilot_conversations_sem_acesso_direto
  ON copilot_conversations
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE copilot_conversations IS
  'Conversas do Copiloto PACE. A aplicação valida acesso à conta no servidor; clientes anon/authenticated não acessam a tabela diretamente.';
COMMENT ON COLUMN copilot_conversations.transcript IS
  'Texto fornecido pelo usuário. Whisper local só chega aqui após ação explícita de salvar.';
COMMENT ON COLUMN copilot_conversations.analysis IS
  'JSON estruturado com cobertura da descoberta, memória consolidada e mudanças percebidas nesta conversa.';
COMMENT ON COLUMN copilot_conversations.source IS
  'Origem da transcrição: colagem, Whisper local, Supernormal ou registro manual.';

NOTIFY pgrst, 'reload schema';

-- Rollback manual (apaga o histórico criado depois desta migration):
-- DROP TABLE IF EXISTS copilot_conversations;
