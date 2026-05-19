-- ─────────────────────────────────────────────────────────────────────────
-- 112 — Login por WhatsApp OTP (colaborador sem email)
--
-- Permite que colaboradores que NÃO têm email entrem no painel via código
-- numérico enviado por WhatsApp (Z-API). O telefone vira identidade.
--
-- Estratégia (mínima superfície / reuso da auth testada):
--   - NÃO mexe na coluna core colaboradores.email (sem DROP NOT NULL).
--   - Colab sem email recebe um email-proxy interno determinístico
--     (wa.<empresaId>.<e164>@nao-email.vertho.ai) — invisível pro usuário,
--     nunca recebe email real. Mantém findColabByEmail / request-context /
--     RLS / middleware funcionando sem alteração.
--   - login_por_whatsapp marca esse subconjunto pra UI mostrar
--     "WhatsApp · sem email" no lugar do proxy.
--   - colab_otp guarda só o HASH do código (sha-256 + pepper), com expiry,
--     limite de tentativas e rate-limit em camada de app.
--
-- Migration puramente ADITIVA (idempotente). Aplica em todos os tenants.
-- ─────────────────────────────────────────────────────────────────────────

-- ─── colaboradores.login_por_whatsapp ─────────────────────────────────────
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS login_por_whatsapp BOOLEAN NOT NULL DEFAULT FALSE;

-- Telefone único por empresa SÓ pro subconjunto que loga por WhatsApp
-- (não colide com legado email-based que pode compartilhar telefone).
CREATE UNIQUE INDEX IF NOT EXISTS uq_colab_wa_telefone
  ON colaboradores (empresa_id, telefone)
  WHERE login_por_whatsapp;

-- ─── colab_otp ────────────────────────────────────────────────────────────
-- Código OTP de login por WhatsApp. Uma linha por emissão. O código em si
-- nunca é persistido — só code_hash = sha256(pepper || codigo).
CREATE TABLE IF NOT EXISTS colab_otp (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  telefone    TEXT NOT NULL,                       -- E.164 (55...)
  code_hash   TEXT NOT NULL,                       -- sha256 hex (pepper + code)
  expires_at  TIMESTAMPTZ NOT NULL,                -- emissão + 10 min
  attempts    INT NOT NULL DEFAULT 0,              -- tentativas de verificação
  consumed_at TIMESTAMPTZ,                         -- preenchido ao validar
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup do OTP vigente: último por (empresa, telefone).
CREATE INDEX IF NOT EXISTS ix_colab_otp_lookup
  ON colab_otp (empresa_id, telefone, created_at DESC);

-- Limpeza/expiração.
CREATE INDEX IF NOT EXISTS ix_colab_otp_expires
  ON colab_otp (expires_at);

-- Acesso só via service role (server-side). RLS ligado sem policy =
-- nega anon/authenticated; service role faz bypass.
ALTER TABLE colab_otp ENABLE ROW LEVEL SECURITY;

-- ─── Verificação ──────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'colaboradores' AND column_name = 'login_por_whatsapp') AS tem_coluna,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name = 'colab_otp') AS tem_tabela,
  (SELECT count(*) FROM pg_indexes
     WHERE indexname = 'uq_colab_wa_telefone') AS tem_indice_unico;
