-- 158 — Segurança: revoga SELECT de anon/authenticated nas materialized views (#41)
--
-- MV não aceita RLS — o GRANT de tabela é a ÚNICA trava. Todas as 13 MVs de
-- public estavam com SELECT pra anon/authenticated → chave anônima lia direto
-- via PostgREST (GET /rest/v1/<mv>). Crítico em `pulse_mv_aggregates` (dado de
-- TENANT, pesquisas de pulso — cross-tenant); as diag_mv_* são censo público,
-- mas não há razão pra expô-las por REST anônimo.
--
-- SEGURO: todo consumo é server-side via createSupabaseAdmin (service_role, que
-- ignora GRANT) — Radar (lib/radar/queries.ts, stats.ts) e pulse dashboard
-- (actions/pulse/dashboard.ts). Nenhuma leitura client-side/anon.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'm'
  LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END $$;
