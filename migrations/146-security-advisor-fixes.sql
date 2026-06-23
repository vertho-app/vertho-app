-- Supabase Security Advisor fixes:
-- 1) Views should run with invoker permissions so underlying RLS is honored.
-- 2) Internal app tables in the public schema must have RLS enabled.

ALTER VIEW IF EXISTS public.diag_view_escola_n0_breakdown
  SET (security_invoker = true);

-- Keep the Radar public-read contract explicit for the invoker view.
GRANT SELECT ON public.diag_saeb_snapshots TO anon, authenticated, service_role;
GRANT SELECT ON public.diag_view_escola_n0_breakdown TO anon, authenticated, service_role;

-- These tables are operated by server-side service-role actions/jobs.
-- RLS is enabled with no public policies so anon/authenticated clients cannot
-- read or mutate them directly.
ALTER TABLE IF EXISTS public.videos_personalizados ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kit_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kit_jobs ENABLE ROW LEVEL SECURITY;
