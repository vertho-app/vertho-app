-- ia_jobs é operada 100% por actions/jobs service-role (bypassa RLS). Habilita RLS
-- SEM policy pública — anon/authenticated não leem nem escrevem direto. Espelha o
-- tratamento de kit_jobs (mig 146). Idempotente.
ALTER TABLE IF EXISTS public.ia_jobs ENABLE ROW LEVEL SECURITY;
