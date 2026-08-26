-- 229 — Limpa de novo o override morto que o reset da demo repôs (25/08/2026).
--
-- A migration 227 já tinha apagado `ai.modelos` das 4 empresas que tinham
-- override. Horas depois, o re-check do acervo morreu 20 vezes com
-- `OpenAI 403 (gpt-5.4)` na ACME Demo — o valor tinha VOLTADO.
--
-- Causa: `lib/demo/reset-acme-demo.ts::demoSysConfig` fazia `{...sourceConfig}`,
-- copiando o `sys_config` inteiro de `lib/demo/acme-demo-fixture.json`, que
-- carregava `{ia3_check: 'gpt-5.4', ia4_check: 'gpt-5.4'}`. A 227 consertou o
-- DADO e deixou o ESCRITOR de pé — no ambiente de demo só sobrevive o que está
-- no código ou no fixture.
--
-- Corrigido na mesma leva: o fixture perdeu o bloco, e `demoSysConfig` passou a
-- NÃO copiar `ai.modelos` (política de modelo é decisão de plataforma, via
-- DEFAULT_TASK_MODELS + PINNED_TASKS, não característica de tenant). Sem essas
-- duas, esta migration seria desfeita no próximo reset das 04h — como a 227 foi.
--
-- Idempotente.
update public.empresas
set sys_config = jsonb_set(sys_config, '{ai,modelos}', '{}'::jsonb)
where sys_config -> 'ai' -> 'modelos' is not null
  and (sys_config -> 'ai' -> 'modelos')::text <> '{}';
