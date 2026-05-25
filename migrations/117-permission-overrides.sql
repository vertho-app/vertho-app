-- ─────────────────────────────────────────────────────────────────────────
-- 117 — Overrides auditáveis de permissões
--
-- A matriz base de papéis fica no código (`lib/permissions.ts`). Esta tabela
-- armazena apenas exceções explícitas e reversíveis por papel ou por usuário.
-- A aplicação usa service-role para ler/escrever; RLS fica habilitado sem
-- políticas públicas para evitar exposição via Data API.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('role', 'user')),
  scope_key TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 5),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT permission_overrides_unique_scope_permission
    UNIQUE (scope_type, scope_key, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_permission_overrides_scope
  ON permission_overrides(scope_type, scope_key);

CREATE INDEX IF NOT EXISTS idx_permission_overrides_permission
  ON permission_overrides(permission_key);

ALTER TABLE permission_overrides ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE permission_overrides IS
'Overrides auditáveis de permissões Vertho. Matriz base vive no código; esta tabela guarda allow/deny explícito por papel ou usuário.';

COMMENT ON COLUMN permission_overrides.scope_key IS
'Formato esperado: role:<papel> ou user:<email_normalizado>.';

CREATE OR REPLACE FUNCTION set_permission_overrides_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_permission_overrides_updated_at ON permission_overrides;
CREATE TRIGGER trg_permission_overrides_updated_at
BEFORE UPDATE ON permission_overrides
FOR EACH ROW
EXECUTE FUNCTION set_permission_overrides_updated_at();
