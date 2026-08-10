-- 207 — Radar: as 2 MVs municipais saem de `anon`/`authenticated` (F3 da auditoria).
--
-- DECISÃO, não regressão. O GRANT era deliberado: a mig 070 (linha 86) concedeu
-- `SELECT ... TO anon, authenticated, service_role` e a linha 158 fez o mesmo com o
-- EXECUTE da RPC. Foi desenhado para leitura pública do Radar.
--
-- Revisitado em 10/08/2026 pela regra consumer-first: **os 3 consumidores no código
-- são todos server-side** (`lib/radar/queries.ts`, `app/radar/_components/benchmark-table.tsx`,
-- `app/radarbett/municipio/[ibge]/page.tsx`), e todos abrem o banco com
-- `createSupabaseAdmin()` — service_role, que ignora GRANT de anon. Nenhum leitor de
-- browser. Consumidor externo: perguntado e descartado pelo dono em 10/08.
--
-- O dado é censo público agregado por município (IDEB/SAEB/ENEM/FUNDEB/ICA), então isto
-- é redução de superfície, não contenção de vazamento. O ganho concreto é outro: o INV4
-- do `rls-posture` era a ÚNICA vermelha da suíte (1343/1344), e um guard cronicamente
-- vermelho não distingue "postura conhecida" de "regressão nova".
--
-- POR QUE A RPC TAMBÉM: `diag_municipio_benchmarks` e `..._municipal` são
-- **SECURITY INVOKER** (conferido em `pg_proc.prosecdef` = false), então elas já
-- passariam a falhar sozinhas quando o SELECT da MV saísse — mas deixar o EXECUTE de pé
-- guarda uma porta que só não abre por acidente. Se alguém marcar a função como
-- SECURITY DEFINER um dia, ela volta a servir o dado sem que nada acuse.
--
-- `refresh_diag_mvs` entra junto pelo mesmo motivo, e é a mais perigosa das três: ela faz
-- REFRESH de 14 MVs. Hoje um `anon` que a chamasse tomaria "permission denied" dentro da
-- função (INVOKER, e o REFRESH exige ser dono) — ou seja, o EXECUTE aberto é inócuo POR
-- ACIDENTE. Marcada SECURITY DEFINER no futuro, vira um DoS de uma linha. Os 5 callers
-- reais usam service_role (2 scripts, 1 fetch cru com a SRK, 2 actions de admin via
-- `requireAdminSupabase`, que devolve `createSupabaseAdmin`).

BEGIN;

REVOKE SELECT ON diag_mv_municipio_metricas            FROM anon, authenticated;
REVOKE SELECT ON diag_mv_municipio_metricas_municipal  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION diag_municipio_benchmarks(text)           FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION diag_municipio_benchmarks_municipal(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION refresh_diag_mvs()                        FROM anon, authenticated;

COMMIT;
