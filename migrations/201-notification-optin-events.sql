-- 201 — notification_optin_events: o funil ANTES da primeira notificação.
--
-- Por que esta tabela existe (é a mais importante das três):
-- push só alcança quem instalou o PWA E concedeu permissão. Medir só a taxa de
-- abertura sobre esse grupo mede um subconjunto auto-selecionado — o número sai
-- ótimo e não responde nada. Se o spike der resultado fraco, sem estes eventos é
-- IMPOSSÍVEL distinguir "push não engaja" de "ninguém conseguiu instalar", que
-- são conclusões opostas e levam a decisões opostas.
--
-- No iOS a distinção é concreta: instalar exige sair do navegador in-app do
-- WhatsApp, abrir no Safari e usar Compartilhar → Adicionar à Tela de Início.
-- É aí que o funil vaza, e é isso que `convite_exibido` x `instalado_detectado`
-- separa.

CREATE TABLE IF NOT EXISTS notification_optin_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id uuid REFERENCES colaboradores(id) ON DELETE CASCADE,
  step           text NOT NULL,
  platform       text,
  user_agent     text,
  detalhe        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_optin_events_step_chk') THEN
    ALTER TABLE notification_optin_events
      ADD CONSTRAINT notification_optin_events_step_chk
      CHECK (step IN (
        'convite_exibido',
        'instalado_detectado',
        'permissao_solicitada',
        'permissao_concedida',
        'permissao_negada',
        'endpoint_registrado'
      ));
  END IF;
END $$;

COMMENT ON TABLE  notification_optin_events IS
  'Degraus do funil de adesão ao push, um evento por linha. A leitura correta é por PESSOA (COUNT DISTINCT colaborador_id por step) sobre o total de elegíveis do piloto — não por evento, que conta a mesma pessoa tentando três vezes.';
COMMENT ON COLUMN notification_optin_events.step IS
  'convite_exibido → instalado_detectado → permissao_solicitada → permissao_concedida|negada → endpoint_registrado. A maior queda entre dois degraus é o diagnóstico; sem os degraus há só o resultado final, que não diz onde falhou.';
COMMENT ON COLUMN notification_optin_events.platform IS
  'ios|android|web derivado do user-agent no servidor. Existe para segmentar o funil: iOS e Android têm exigências de instalação diferentes e misturá-los esconde as duas.';
COMMENT ON COLUMN notification_optin_events.user_agent IS
  'Cru, para reclassificar depois sem perder o dado — heurística de user-agent envelhece e recategorizar exige a string original.';

CREATE INDEX IF NOT EXISTS idx_notif_optin_empresa_step
  ON notification_optin_events (empresa_id, step, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_optin_colab
  ON notification_optin_events (colaborador_id, created_at DESC);

ALTER TABLE notification_optin_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON notification_optin_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_optin_events TO service_role;

-- Rollback (se precisar):
-- DROP TABLE IF EXISTS notification_optin_events;
