-- 155 — Segurança: fecha a RCE do exec_sql(text)
--
-- public.exec_sql(query text) é SECURITY DEFINER, corpo `EXECUTE query`, sem
-- search_path fixo. O grant DEFAULT do Postgres (EXECUTE TO PUBLIC em toda
-- função nova) a tornava chamável por `anon`/`authenticated` via PostgREST
-- (`POST /rest/v1/rpc/exec_sql`) — RCE total com a chave anônima do browser.
-- A função é fantasma (zero referências em app/lib/actions/scripts).
--
-- Remove o acesso público; `service_role`/owner mantêm (já têm privilégio total
-- e não são expostos ao cliente). Reversível. Follow-up possível: DROP FUNCTION.

REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM authenticated;
