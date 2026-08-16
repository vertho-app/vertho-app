-- 218 — Push da inbox para a equipe (platform admin).
--
-- CONTEXTO
-- ───────
-- O push que existe até aqui (migs 200/203/205) é COLABORADOR → PÍLULA:
--   notification_endpoints.colaborador_id  +  installation_id
-- A inbox precisa do outro lado: MENSAGEM RECEBIDA → EQUIPE VERTHO.
--   O destinatário NÃO é um colaborador de um tenant — é um platform admin
--   (auth.users + platform_admins), sem vínculo com empresa/colaborador.
--
-- Em 11/08/2026 a mig 202 removeu `user_id` ("coluna órfã cross-tenant") porque
-- para pílula `colaborador_id` é a identidade correta. Para inbox a identidade
-- correta É `user_id`: platform admin não tem colaborador_id, e usar
-- colaborador_id aqui cruzaria tenants. Recriar a coluna é o caminho certo —
-- com a constraint que impede as duas identidades na mesma linha.

-- (1) Recria user_id para o caso admin (mig 202 tinha dropado).
ALTER TABLE notification_endpoints
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- (2) Uma linha é OU colaborador OU admin — nunca as duas, nunca nenhuma.
--     Idempotente: só adiciona se ainda não existir.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notif_endpoints_identidade_chk') THEN
    ALTER TABLE notification_endpoints
      ADD CONSTRAINT notif_endpoints_identidade_chk
      CHECK (
        ( (colaborador_id IS NOT NULL)::int + (user_id IS NOT NULL)::int ) = 1
      );
  END IF;
END $$;

-- (3) Uma instalação por admin (par do UNIQUE que já existe para colaborador).
--     Parcial: só vale quando user_id está preenchido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_endpoints_admin_instalacao_uniq
  ON notification_endpoints (user_id, installation_id)
  WHERE user_id IS NOT NULL;

-- (4) Índice para o fan-out da inbox: todos os admins com push ativo.
CREATE INDEX IF NOT EXISTS idx_notif_endpoints_admin_ativo
  ON notification_endpoints (user_id)
  WHERE enabled AND user_id IS NOT NULL;

COMMENT ON COLUMN notification_endpoints.user_id IS
  'auth.users.id do platform admin (inbox). NULL quando a linha é de colaborador. Uma linha tem EXATAMENTE um dono: colaborador_id XOR user_id.';
COMMENT ON INDEX idx_notif_endpoints_admin_instalacao_uniq IS
  'Uma instalação por admin (user_id, installation_id). Par do UNIQUE de colaborador — evita contar reinstalações como pessoas distintas.';
COMMENT ON INDEX idx_notif_endpoints_admin_ativo IS
  'Fan-out da inbox: todas as instalações ativas da equipe.';

-- Rollback (se precisar):
-- DROP INDEX IF EXISTS idx_notif_endpoints_admin_ativo;
-- DROP INDEX IF EXISTS idx_notif_endpoints_admin_instalacao_uniq;
-- ALTER TABLE notification_endpoints DROP CONSTRAINT IF EXISTS notif_endpoints_identidade_chk;
-- ALTER TABLE notification_endpoints DROP COLUMN IF EXISTS user_id;
