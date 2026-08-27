-- 230 — contexto de execução no ledger de IA
--
-- Por que (26/08/2026): o ledger registra `latency_ms`, mas NÃO registra onde a
-- chamada rodou. `source` distingue batch de síncrono, não rota de Trigger — e
-- os orçamentos de tempo desses dois são de ordens diferentes (300s/800s numa
-- rota, 3600s numa task). Sem isso, "estamos perto do timeout?" não é
-- respondível pelo dado.
--
-- O custo disso já apareceu: em 26/08 eu segurei o teto de `modulo_base_autor`
-- afirmando "227s contra os 300s da rota — 76% do relógio". Nenhum dos caminhos
-- que executam essa task tem 300s (a rota interna declara 800, os outros três
-- consumidores são tasks do Trigger). A premissa errada sobreviveu porque não
-- havia como contestá-la com dado.
--
-- `runtime`      — quem declarou a execução ('trigger' | 'rota' | 'action' |
--                  'script' | 'desconhecido'). NUNCA inferido por sniffing de
--                  env var não documentada: é declarado por quem sabe, e quem
--                  não declara aparece como 'desconhecido' — visível, não chute.
-- `orcamento_ms` — o teto de tempo daquele contexto, quando conhecido. É o
--                  denominador que transforma `latency_ms` em "perto do limite".

ALTER TABLE ia_usage_log
  ADD COLUMN IF NOT EXISTS runtime text,
  ADD COLUMN IF NOT EXISTS orcamento_ms integer;

COMMENT ON COLUMN ia_usage_log.runtime IS
  'Contexto declarado da execução: trigger | rota | action | script | desconhecido. Declarado via lib/execucao-contexto.ts, nunca inferido.';
COMMENT ON COLUMN ia_usage_log.orcamento_ms IS
  'Teto de tempo do contexto (maxDuration), quando conhecido. Denominador de latency_ms para responder "perto do timeout?".';

-- Índice parcial: as consultas de saúde perguntam por chamadas que consumiram
-- boa parte do orçamento, e essas são a minoria. Sem o predicado, o índice
-- cobriria a tabela inteira para responder sobre a cauda.
CREATE INDEX IF NOT EXISTS ia_usage_log_orcamento_idx
  ON ia_usage_log (runtime, feature)
  WHERE orcamento_ms IS NOT NULL;

NOTIFY pgrst, 'reload schema';
