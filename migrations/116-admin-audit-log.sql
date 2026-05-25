-- ═════════════════════════════════════════════════════════════════
-- Migration 116 — Log de auditoria de ações de admin
-- Rastreia QUEM (admin) fez O QUê (ação sensível: disparos + mutações),
-- em QUAL empresa e COM QUAL resultado. Append-only. Cross-tenant
-- (empresa_id nullable: algumas ações são da plataforma).
-- Preenche o gap onde disparos (WhatsApp/email/magic-link) não deixavam
-- nenhum rastro no banco.
-- ═════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email   TEXT NOT NULL,                 -- quem fez (ctx.email do requireAdminAction)
  admin_user_id UUID,                          -- auth.users.id, quando disponível
  acao          TEXT NOT NULL,                 -- ex: 'whatsapp.broadcast', 'empresa.excluir', 'temporada.gerar'
  empresa_id    UUID REFERENCES empresas(id) ON DELETE SET NULL,  -- alvo (null = ação da plataforma)
  empresa_slug  TEXT,                          -- conveniência de leitura (sobrevive a delete da empresa)
  alvo          TEXT,                          -- descrição curta do alvo (ex: '53 colaboradores', um id)
  detalhes      JSONB NOT NULL DEFAULT '{}',   -- payload: canal, filtros, contagem, erro, etc.
  resultado     TEXT NOT NULL DEFAULT 'ok',    -- 'ok' | 'parcial' | 'erro'
  ip            TEXT,                          -- best-effort (x-forwarded-for)
  user_agent    TEXT,                          -- best-effort
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_criado     ON admin_audit_log(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_empresa    ON admin_audit_log(empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin      ON admin_audit_log(admin_email, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_acao       ON admin_audit_log(acao, criado_em DESC);

COMMENT ON TABLE admin_audit_log IS
  'Trilha de auditoria de ações de platform admin (disparos + mutações). Append-only; gravado via service-role pelo helper lib/audit.ts. Leitura só por platform admin em /admin/auditoria.';

-- RLS: habilitado, política permissiva (service-role bypassa; leitura é
-- gated na camada de app — só platform admin acessa /admin/auditoria).
-- Mantém o padrão das demais tabelas do projeto.
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_audit_permissive ON admin_audit_log;
CREATE POLICY admin_audit_permissive ON admin_audit_log FOR ALL USING (true) WITH CHECK (true);

-- Rollback (se precisar):
-- DROP TABLE IF EXISTS admin_audit_log;
