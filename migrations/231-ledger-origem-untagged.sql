-- 231 — de onde veio a chamada sem `taskKey`
--
-- Por que (27/08/2026): `untagged` é 33% da produção — 3.630 chamadas, US$ 96
-- só em Sonnet 4.6 — e o ledger responde "quanto" sem responder "onde". É o
-- achado F13 da auditoria de 09-10/08, ainda aberto, e a razão de ele não
-- fechar é estrutural: etiquetar os 52 call-sites conhecidos resolve os de
-- hoje e não os de amanhã.
--
-- A allowlist estática diz QUAIS sites não têm etiqueta. Ela não diz QUAIS
-- rodam — e o tráfego recente tem UMA assinatura só (input ~2.100, saída
-- ~2.200, 42s, todo dia), ou seja, um punhado responde por quase tudo. Sem
-- medir, escolher qual etiquetar primeiro é chute.
--
-- `origem_codigo` é preenchido SÓ quando falta `taskKey`, com a cadeia de nomes
-- de função extraída do stack (`lib/origem-chamada.ts`). Nome de função, e não
-- arquivo:linha, porque em produção o código é bundlado: o caminho vira
-- `chunks/1234.js:56` e muda a cada deploy. Quando nem o nome sobrevive, fica
-- NULL — "não consegui" visível, em vez de rótulo inventado.

ALTER TABLE ia_usage_log
  ADD COLUMN IF NOT EXISTS origem_codigo text;

COMMENT ON COLUMN ia_usage_log.origem_codigo IS
  'Cadeia de funções que originou a chamada, preenchida SÓ quando falta taskKey. Nome de função (sobrevive ao bundle), não arquivo:linha. NULL = não foi possível determinar.';

-- Só as linhas sem etiqueta interessam a esta pergunta, e elas são a minoria.
CREATE INDEX IF NOT EXISTS ia_usage_log_origem_untagged_idx
  ON ia_usage_log (origem_codigo, model)
  WHERE origem_codigo IS NOT NULL;

NOTIFY pgrst, 'reload schema';
