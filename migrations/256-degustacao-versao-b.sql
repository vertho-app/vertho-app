-- 256: degustação versão B (convite guiado) e cargo das Escolas
--
-- `Medido 16/09/2026`: dos 8 prospects reais desde 08/09, nenhum fez o DISC nem
-- abriu as visões 02 a 04. O "acesso" da etapa 01 era carimbado pelo robô de
-- preview do WhatsApp, porque o GET do link já criava a sessão. A versão B manda
-- UM link para uma página de boas-vindas que não cria sessão, e a abertura só é
-- registrada quando o navegador de verdade roda JavaScript.
--
-- A versão A continua existindo: toda linha antiga (e toda nova sem versão) é A.
--
-- 1. `experience_version`: qual roteiro o vendedor mandou ('A' | 'B').
-- 2. `invite_opened_at`: primeira abertura verificada do convite B (beacon no
--    navegador ou primeiro clique), nunca o GET cru que o robô também faz.
-- 3. CHECK de `role_key` passa a aceitar `professor`: as Escolas oferecem
--    degustação desde 01/09 e o insert do passaporte falharia nesta CHECK, que
--    só conhecia os quatro cargos comerciais.

ALTER TABLE demo_prospect_sessions
  ADD COLUMN IF NOT EXISTS experience_version text NOT NULL DEFAULT 'A';

ALTER TABLE demo_prospect_sessions
  DROP CONSTRAINT IF EXISTS demo_prospect_sessions_experience_version_check;
ALTER TABLE demo_prospect_sessions
  ADD CONSTRAINT demo_prospect_sessions_experience_version_check
  CHECK (experience_version IN ('A', 'B'));

ALTER TABLE demo_prospect_sessions
  ADD COLUMN IF NOT EXISTS invite_opened_at timestamptz;

ALTER TABLE demo_prospect_sessions
  DROP CONSTRAINT IF EXISTS demo_prospect_sessions_role_key_check;
ALTER TABLE demo_prospect_sessions
  ADD CONSTRAINT demo_prospect_sessions_role_key_check
  CHECK (role_key IN (
    'representante-comercial',
    'gerente-comercial',
    'analista-financeiro',
    'coordenador-operacoes',
    'professor'
  ));

COMMENT ON TABLE demo_prospect_sessions IS
  'Passaportes da degustação nos ambientes de demonstração: validade, versão do roteiro e primeiros marcos por prospect.';
COMMENT ON COLUMN demo_prospect_sessions.experience_version IS
  'Roteiro enviado ao prospect: A (quatro links, etapa 01 loga direto) ou B (um link para a página de boas-vindas).';
COMMENT ON COLUMN demo_prospect_sessions.invite_opened_at IS
  'Primeira abertura VERIFICADA do convite (navegador com JavaScript ou clique). O GET do robô de preview não carimba.';

NOTIFY pgrst, 'reload schema';

-- Rollback manual (reverter o código que lê as colunas ANTES):
-- ALTER TABLE demo_prospect_sessions DROP CONSTRAINT IF EXISTS demo_prospect_sessions_experience_version_check;
-- ALTER TABLE demo_prospect_sessions DROP COLUMN IF EXISTS invite_opened_at;
-- ALTER TABLE demo_prospect_sessions DROP COLUMN IF EXISTS experience_version;
-- ALTER TABLE demo_prospect_sessions DROP CONSTRAINT IF EXISTS demo_prospect_sessions_role_key_check;
-- ALTER TABLE demo_prospect_sessions ADD CONSTRAINT demo_prospect_sessions_role_key_check
--   CHECK (role_key IN ('representante-comercial','gerente-comercial','analista-financeiro','coordenador-operacoes'));
-- NOTIFY pgrst, 'reload schema';
