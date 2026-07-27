-- 189 · pipeline_health_runs: aceita o modo 'horizonte'.
--
-- Por que este modo existe: os três modos anteriores olham a entrega de amanhã, o
-- envio de hoje e a integridade estrutural. Nenhum responde "o que as PRÓXIMAS
-- semanas vão pedir e ainda não existe?" — e essa é a pergunta cuja ausência foi
-- medida em 27/07 no Ibipeba: a trilha troca de BLOCO DE COMPETÊNCIAS na semana 5, os
-- 3 pares (competência × cargo) que entram ali eram 100% novos e nenhum tinha kit,
-- com o piloto já na semana 3. Os kits das semanas 1-3 foram gerados sob demanda, uma
-- rodada por vez; o bloco novo nunca entrou em rodada nenhuma.
--
-- O pré-voo teria acusado — 25h antes. Isso basta para reenviar um e-mail, não para
-- PRODUZIR: kit leva ~5min por DISC e ali eram 41. Detectar tarde é o mesmo que não
-- detectar quando a correção é lenta.
--
-- `data_alvo` fica NULL neste modo: o horizonte avalia uma JANELA de semanas, não uma
-- data de entrega.

ALTER TABLE pipeline_health_runs DROP CONSTRAINT IF EXISTS pipeline_health_runs_modo_check;
ALTER TABLE pipeline_health_runs ADD CONSTRAINT pipeline_health_runs_modo_check
  CHECK (modo IN ('preflight', 'postflight', 'estrutural', 'horizonte'));

COMMENT ON COLUMN pipeline_health_runs.modo IS
  'preflight (véspera da entrega) · postflight (confere o que saiu) · estrutural (integridade) · horizonte (semanal, o que as próximas semanas vão pedir e ainda não existe; data_alvo NULL).';

-- Rollback (só funciona se não houver linha com modo='horizonte'):
-- ALTER TABLE pipeline_health_runs DROP CONSTRAINT IF EXISTS pipeline_health_runs_modo_check;
-- ALTER TABLE pipeline_health_runs ADD CONSTRAINT pipeline_health_runs_modo_check
--   CHECK (modo IN ('preflight', 'postflight', 'estrutural'));
