-- 236 — acompanhamento das experiências individuais do ACME Demo
--
-- Cada roteiro tem identidade própria e mantém os primeiros acessos às quatro
-- perspectivas, além da conclusão do DISC. A linha sobrevive à remoção do
-- colaborador temporário para preservar o histórico comercial.

CREATE TABLE IF NOT EXISTS demo_prospect_sessions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                text NOT NULL UNIQUE
                            CHECK (session_id ~ '^[a-f0-9]{20}$'),
  empresa_id                uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id            uuid REFERENCES colaboradores(id) ON DELETE SET NULL,
  auth_email                text NOT NULL UNIQUE,
  prospect_name             text NOT NULL,
  prospect_company          text NOT NULL,
  role_key                  text NOT NULL
                            CHECK (role_key IN (
                              'representante-comercial',
                              'gerente-comercial',
                              'analista-financeiro',
                              'coordenador-operacoes'
                            )),
  cargo                     text NOT NULL,
  created_by_email          text NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  expires_at                timestamptz NOT NULL,
  personal_accessed_at      timestamptz,
  disc_completed_at         timestamptz,
  colaborador_accessed_at   timestamptz,
  gestor_accessed_at        timestamptz,
  rh_accessed_at            timestamptz,
  access_closed_at          timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_demo_prospect_sessions_created
  ON demo_prospect_sessions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_demo_prospect_sessions_open_expiry
  ON demo_prospect_sessions (expires_at)
  WHERE access_closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_demo_prospect_sessions_colaborador
  ON demo_prospect_sessions (colaborador_id)
  WHERE colaborador_id IS NOT NULL;

ALTER TABLE demo_prospect_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON demo_prospect_sessions FROM anon;
REVOKE ALL ON demo_prospect_sessions FROM authenticated;

DROP POLICY IF EXISTS demo_prospect_sessions_sem_acesso_direto
  ON demo_prospect_sessions;
CREATE POLICY demo_prospect_sessions_sem_acesso_direto
  ON demo_prospect_sessions
  FOR ALL
  TO anon, authenticated
  USING (empresa_id = get_empresa_id() AND false)
  WITH CHECK (empresa_id = get_empresa_id() AND false);

COMMENT ON TABLE demo_prospect_sessions IS
  'Passaportes comerciais do ACME Demo: validade e primeiros marcos de acesso por prospect.';
COMMENT ON COLUMN demo_prospect_sessions.session_id IS
  'Identificador aleatório presente somente em tickets assinados e metadados internos do Auth.';
COMMENT ON COLUMN demo_prospect_sessions.access_closed_at IS
  'Momento em que o acesso expirado foi removido do tenant e do Supabase Auth.';

NOTIFY pgrst, 'reload schema';

-- Rollback manual (remove também o histórico de acompanhamento):
-- DROP TABLE IF EXISTS demo_prospect_sessions;
