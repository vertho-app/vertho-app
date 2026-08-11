-- 209 — `diag_view_escola_n0_breakdown` sai de anon/authenticated.
--
-- Encontrada em 10/08/2026 numa revisão crítica do fechamento do F3, e o achado
-- não é a view: é o GUARD. O INV4 do `rls-posture` varre `c.relkind = 'm'`, ou
-- seja **só materialized views**. Uma VIEW comum com GRANT a `anon` fica fora da
-- conta — e era o caso desta, com 463.684 linhas legíveis pela anon key do
-- bundle. Mesmo perfil das duas MVs revogadas na mig 207 (censo SAEB por escola,
-- dado público do INEP), e o mesmo consumidor: `lib/radar/queries.ts:817`, que
-- lê com service_role.
--
-- Decisão coerente com a de hoje: o Radar saiu do ar público (`2edf9819`) e as
-- MVs municipais já perderam o grant. Não há motivo para esta continuar aberta.
--
-- ⚠️ A correção de verdade acompanha esta migration: o INV4 passa a cobrir
-- `relkind IN ('m','v')`. Revogar sem consertar o guard deixaria a próxima view
-- aberta invisível do mesmo jeito.

BEGIN;

REVOKE SELECT ON diag_view_escola_n0_breakdown FROM anon, authenticated;

COMMIT;
