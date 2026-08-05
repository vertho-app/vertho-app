-- 200 — notification_endpoints: para onde um push pode ser entregue.
--
-- Um "endpoint" é uma INSTALAÇÃO, não uma pessoa: a mesma pessoa pode ter o PWA
-- no iPhone e o navegador no desktop, e o token de push muda sozinho (rotação do
-- provedor, reinstalação). Por isso a identidade estável é `installation_id`,
-- gerado no cliente e guardado localmente — o token é dado volátil pendurado
-- nele, nunca a chave.
--
-- `platform`/`provider` já existem porque a coluna é barata e o schema não deve
-- precisar de migration para receber Android. A ABSTRAÇÃO multi-provedor, essa
-- não existe ainda: só webpush tem consumidor hoje (regra consumer-first).

CREATE TABLE IF NOT EXISTS notification_endpoints (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,
  empresa_id      uuid REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id  uuid REFERENCES colaboradores(id) ON DELETE CASCADE,
  installation_id text NOT NULL,
  platform        text NOT NULL,
  provider        text NOT NULL DEFAULT 'webpush',
  subscription    jsonb NOT NULL,
  environment     text NOT NULL DEFAULT 'production',
  enabled         boolean NOT NULL DEFAULT true,
  user_agent      text,
  last_seen_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_endpoints_platform_chk') THEN
    ALTER TABLE notification_endpoints
      ADD CONSTRAINT notification_endpoints_platform_chk
      CHECK (platform IN ('ios', 'android', 'web'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_endpoints_provider_chk') THEN
    ALTER TABLE notification_endpoints
      ADD CONSTRAINT notification_endpoints_provider_chk
      CHECK (provider IN ('webpush', 'fcm', 'apns'));
  END IF;

  -- Uma instalação por colaborador: reinscrever a mesma instalação ATUALIZA o
  -- token em vez de criar duplicata. Sem isto, "quantas pessoas têm push?"
  -- viraria contagem de reinstalações — o erro de contar eventos como gente.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_endpoints_instalacao_uniq') THEN
    ALTER TABLE notification_endpoints
      ADD CONSTRAINT notification_endpoints_instalacao_uniq
      UNIQUE (colaborador_id, installation_id);
  END IF;
END $$;

COMMENT ON TABLE  notification_endpoints IS
  'Uma linha por INSTALAÇÃO que aceita push. Contar pessoas com push = COUNT(DISTINCT colaborador_id) WHERE enabled, nunca COUNT(*).';
COMMENT ON COLUMN notification_endpoints.installation_id IS
  'Identidade estável da instalação, gerada no cliente. O token do provedor rotaciona; este id não — por isso o upsert casa por (colaborador_id, installation_id).';
COMMENT ON COLUMN notification_endpoints.subscription IS
  'Payload cru do provedor (para webpush: endpoint + keys p256dh/auth). Guardado como veio: reserializar por conta própria é como se perde uma inscrição em silêncio.';
COMMENT ON COLUMN notification_endpoints.enabled IS
  'false = provedor devolveu 404/410 (inscrição morta) ou o usuário desativou. Nunca deletamos a linha: some do numerador e o histórico de quem já teve push também sumiria.';
COMMENT ON COLUMN notification_endpoints.provider IS
  'Coluna preparada para fcm/apns, mas só webpush tem código hoje. Coluna é barata; abstração sem consumidor, não.';

CREATE INDEX IF NOT EXISTS idx_notif_endpoints_colab
  ON notification_endpoints (colaborador_id) WHERE enabled;
CREATE INDEX IF NOT EXISTS idx_notif_endpoints_empresa
  ON notification_endpoints (empresa_id) WHERE enabled;

ALTER TABLE notification_endpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON notification_endpoints FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_endpoints TO service_role;

-- FK que a 198 deixou pendente (a tabela alvo não existia ainda).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_deliveries_endpoint_fk') THEN
    ALTER TABLE notification_deliveries
      ADD CONSTRAINT notification_deliveries_endpoint_fk
      FOREIGN KEY (endpoint_id) REFERENCES notification_endpoints(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Rollback (se precisar):
-- ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_endpoint_fk;
-- DROP TABLE IF EXISTS notification_endpoints;
