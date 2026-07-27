-- 186 · Fecha a postura de RLS de `pipeline_health_runs` (mig 184).
--
-- A mig 184 criou a tabela sem RLS e o guard `tests/unit/security/rls-posture.test.ts`
-- (INV1) reprovou na hora: tabela de `public` com RLS OFF que concede SELECT a `anon`.
-- O guard estava certo — os achados guardam AMOSTRAS com nome de colaborador
-- ("Fulana · p2 · promete video"), ou seja, PII de tenant num relatório operacional.
--
-- Vale registrar por que isso não foi pego antes de aplicar: a migration foi escrita
-- pensando no conteúdo (o que medir) e não na postura (quem lê). O guard é que
-- transformou a omissão em erro imediato em vez de exposição silenciosa — é
-- exatamente o papel que o health-check tenta cumprir para o pipeline.
--
-- Sem policy: o app inteiro lê por service_role (que bypassa RLS). RLS ligada e
-- nenhuma policy = ninguém mais lê. Se um dia a leitura precisar sair pelo cliente,
-- a policy correta é por platform_admin, nunca por tenant.

ALTER TABLE pipeline_health_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON pipeline_health_runs FROM anon;
REVOKE ALL ON pipeline_health_runs FROM authenticated;

COMMENT ON TABLE pipeline_health_runs IS
  'Execuções do health-check do pipeline (lib/pipeline-health). RLS ON e sem policy: leitura só por service_role — os achados contêm nomes de colaboradores.';

-- Rollback:
-- ALTER TABLE pipeline_health_runs DISABLE ROW LEVEL SECURITY;
