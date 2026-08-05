-- 198 — notification_deliveries: registro unificado de entrega por CANAL.
--
-- Por que existe: até aqui o serviço central de WhatsApp (lib/whatsapp/index.ts)
-- não persistia NADA — a única tabela de envio era `envios_diagnostico`, que
-- cobre só o diagnóstico. Sem log não há denominador: não dá para responder
-- "quanto do volume de WhatsApp é cadência (pílula/nudge) e quanto é
-- autenticação (OTP/magic link)", que é a premissa do projeto de Web Push.
--
-- Esta tabela nasce cobrindo o canal ATUAL (whatsapp) para que a comparação com
-- push, quando existir, seja entre populações medidas do mesmo jeito.
--
-- Escopo nesta migration: só a tabela. `endpoint_id` já existe como coluna, mas
-- a FK para `notification_endpoints` entra na 199, quando a tabela existir.

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid REFERENCES empresas(id) ON DELETE SET NULL,
  colaborador_id uuid REFERENCES colaboradores(id) ON DELETE SET NULL,
  kind           text,
  channel        text NOT NULL,
  provider       text,
  endpoint_id    uuid,
  status         text NOT NULL,
  error          text,
  dedupe_key     text,
  sent_at        timestamptz NOT NULL DEFAULT now(),
  opened_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Restrições de domínio (idempotentes: DO block porque ADD CONSTRAINT não tem IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_deliveries_channel_chk') THEN
    ALTER TABLE notification_deliveries
      ADD CONSTRAINT notification_deliveries_channel_chk
      CHECK (channel IN ('whatsapp', 'email', 'webpush', 'fcm', 'apns'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_deliveries_status_chk') THEN
    ALTER TABLE notification_deliveries
      ADD CONSTRAINT notification_deliveries_status_chk
      CHECK (status IN ('tentativa', 'sucesso', 'falha'));
  END IF;
END $$;

COMMENT ON TABLE  notification_deliveries IS
  'Uma linha por tentativa de entrega, em qualquer canal. Serve de denominador para comparar canais (WhatsApp x push) por PESSOA, não por evento.';
COMMENT ON COLUMN notification_deliveries.kind IS
  'Motivo de NEGÓCIO do envio (pilula, otp, magic_link, convite, nudge, alerta...). NULL = call site ainda não instrumentado — lacuna proposital e CONTÁVEL, nunca silenciosa.';
COMMENT ON COLUMN notification_deliveries.channel IS
  'Canal físico da entrega. Não confundir com kind: um mesmo kind pode sair por canais diferentes.';
COMMENT ON COLUMN notification_deliveries.provider IS
  'Fornecedor que atendeu dentro do canal (zapi, wasender, resend, webpush). NULL quando nenhum chegou a tentar.';
COMMENT ON COLUMN notification_deliveries.endpoint_id IS
  'Endpoint de push usado (FK para notification_endpoints, adicionada na migration 199). NULL para whatsapp/email.';
COMMENT ON COLUMN notification_deliveries.status IS
  'tentativa = registrada antes de saber o desfecho; sucesso/falha = desfecho conhecido.';
COMMENT ON COLUMN notification_deliveries.dedupe_key IS
  'Chave de idempotência do emissor (ex.: pilula:<colab>:semana<N>). Indexada, mas NÃO única: unicidade entraria em conflito com reenvio legítimo e só faz sentido quando o push definir a semântica de retry.';
COMMENT ON COLUMN notification_deliveries.opened_at IS
  'Só o push consegue observar abertura. WhatsApp fica NULL por natureza — por isso a comparação honesta entre canais é por pessoa alcançada, não por taxa de abertura.';

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_empresa_sent
  ON notification_deliveries (empresa_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_colab_sent
  ON notification_deliveries (colaborador_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_kind_channel_sent
  ON notification_deliveries (kind, channel, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_dedupe
  ON notification_deliveries (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- RLS: o app roda 100% service-role (que tem BYPASSRLS). A RLS aqui não protege
-- o app — protege contra exposição acidental via Data API para anon/authenticated.
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON notification_deliveries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_deliveries TO service_role;

-- Rollback (se precisar):
-- DROP TABLE IF EXISTS notification_deliveries;
