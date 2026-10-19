-- 294 — `refresh_mv_mercado_potencial()` deixa de ser chamável pela chave pública
--
-- Medido em 19/10/2026 (`has_function_privilege`): anon e authenticated podiam executar a
-- função, pelo grant padrão de EXECUTE a PUBLIC (`proacl` com `=X/postgres` e
-- `anon=X/postgres`). Qualquer um com a chave anon do navegador chamava
-- `POST /rest/v1/rpc/refresh_mv_mercado_potencial` e disparava o refresh das três views do
-- Mercado Potencial: esvazia e repopula a tabela intermediária e recalcula ~210 mil escolas,
-- pesado o bastante para deixar o banco lento enquanto roda.
--
-- Quem chama de verdade (`grep` no repositório, 19/10): só `refreshMercadoPotencial` em
-- `app/admin/vertho/mercado-potencial/actions.ts`, com o cliente service_role e a permissão
-- `radar.admin.access`. Não há pg_cron neste banco. O dono (postgres) mantém o EXECUTE.
--
-- Idempotente.

REVOKE ALL ON FUNCTION public.refresh_mv_mercado_potencial() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_mv_mercado_potencial() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_mv_mercado_potencial() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_mv_mercado_potencial() TO service_role;

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar; devolve o refresh a qualquer um com a chave pública):
-- GRANT EXECUTE ON FUNCTION public.refresh_mv_mercado_potencial() TO PUBLIC;
