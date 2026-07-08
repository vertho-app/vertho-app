-- Development Blueprint (Fase 1, Estágio 1) — fonte ÚNICA de desenvolvimento por
-- colaborador (foco do cargo + assessments IA4 + DISC → objeto estruturado). PDI e
-- trilha passam a ser RENDERIZAÇÕES deste blueprint (Estágios 2-3). `blueprint` é o
-- JSON de `lib/blueprint/types.ts::DevelopmentBlueprint`. Latest por colaborador
-- (o UPSERT da action substitui o anterior). Idempotente.
CREATE TABLE IF NOT EXISTS public.development_blueprints (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  colaborador_id uuid NOT NULL,
  blueprint     jsonb NOT NULL,
  spec_version  int  NOT NULL DEFAULT 1,
  gerado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_development_blueprints_colab
  ON public.development_blueprints (empresa_id, colaborador_id);

-- Latest por colaborador: 1 linha por (empresa_id, colaborador_id) — o UPSERT da
-- action substitui a versão anterior. UNIQUE dá suporte ao onConflict.
CREATE UNIQUE INDEX IF NOT EXISTS uq_development_blueprints_colab
  ON public.development_blueprints (empresa_id, colaborador_id);

-- development_blueprints é operada 100% por actions service-role (bypassa RLS).
-- Habilita RLS SEM policy pública — anon/authenticated não leem nem escrevem
-- direto. Espelha o tratamento de ia_jobs (mig 173). Idempotente.
ALTER TABLE IF EXISTS public.development_blueprints ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
