-- 227 — Remove os overrides por task de `sys_config.ai.modelos` (25/08/2026).
--
-- POR QUÊ
-- ───────
-- Havia 8 overrides em 4 empresas, e nenhum deveria existir:
--
--   ACME, Bett, Ibipeba  → ia3_check/ia4_check = 'gpt-5.6-terra'
--     No-op: é EXATAMENTE o default pinado em DEFAULT_TASK_MODELS. Não mudavam
--     nada e só criavam superfície para drift.
--
--   ACME Demo            → ia3_check/ia4_check = 'gpt-5.4'
--     🔴 O defeito. `Medido:` o id devolve HTTP 403 com a chave do projeto e
--     sumiu da listagem /v1/models (o alias puro morreu; só o snapshot datado
--     `gpt-5.4-2026-03-05` continua vivo). Override explícito por task VENCE o
--     pin, de propósito — então os dois auditores Dual-IA daquele tenant
--     apontavam para um modelo inexistente.
--
--     Sintoma coerente: a ACME Demo tem 25 cenários e só 10 checados, enquanto
--     todos os outros tenants estão em ~100% (Ibipeba 66/68, ACME 20/20,
--     Teste Piloto 10/10). É o tenant mais ativo em IA do sistema — 3.471
--     chamadas — e ZERO delas foram ia3_check ou ia4_check.
--
-- O QUE MUDA NO COMPORTAMENTO
-- ───────────────────────────
-- Nada, para 3 das 4 empresas: sem override, `resolveTaskModel` cai no default
-- pinado, que já era `gpt-5.6-terra`. Para a ACME Demo, os checks passam a
-- resolver para um modelo que existe.
--
-- ⚠️ ESTA MIGRATION NÃO É A DEFESA. Ela limpa o estado; quem impede a repetição
-- são duas coisas no código, da mesma leva:
--   · `validarModelosDoSysConfig` (porta de escrita) — barra id sem preço/rota;
--   · R14 do health-check (`checarModelosConfigurados`) — pergunta ao provedor
--     de forma recorrente se o id ainda existe. É este que pegaria o caso real,
--     porque `gpt-5.4` era VÁLIDO quando foi gravado e morreu depois. Nenhuma
--     validação de escrita enxerga drift de provedor.
--
-- Idempotente: reaplicar não faz nada (o `where` já exclui `{}`).
-- Reversível: os valores anteriores estão no comentário acima, empresa por empresa.

update empresas
set sys_config = jsonb_set(sys_config, '{ai,modelos}', '{}'::jsonb)
where sys_config -> 'ai' -> 'modelos' is not null
  and (sys_config -> 'ai' -> 'modelos')::text <> '{}';
