-- 187 · Lock de execução do cron (F-C3 do docs/FMEA-PIPELINE.md).
--
-- `triggerDiario` decide o que enviar lendo os carimbos em T0 e só grava DEPOIS de
-- publicar. Duas execuções sobrepostas (retry do Vercel num timeout, ou disparo
-- manual concorrente) leem os mesmos `null` e ambas enviam: pílula 2× nos dois
-- canais e — pior — o avanço de semana aplicado 2×, que PULA uma semana inteira de
-- conteúdo. É um check-then-act sem atomicidade.
--
-- Por que lock e não "stamp-then-send": inverter a ordem tornaria o envio
-- at-most-once, trocando o risco de duplicar pelo de PERDER — e perder em silêncio
-- é exatamente o modo de falha que este pipeline já tem demais. O lock preserva a
-- semântica atual e elimina a concorrência, que é a causa real.
--
-- Mecanismo: `INSERT ... ON CONFLICT DO NOTHING` numa chave por (job, dia). Quem
-- inserir roda; quem colidir desiste. Atômico, sem transação explícita, e o
-- histórico serve de auditoria de execuções.

CREATE TABLE IF NOT EXISTS cron_execucoes (
  job          text        NOT NULL,
  dia          date        NOT NULL,
  iniciado_em  timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  resultado    text,
  PRIMARY KEY (job, dia)
);

COMMENT ON TABLE cron_execucoes IS
  'Lock + auditoria de execução dos crons. PK (job, dia) faz o INSERT ON CONFLICT DO NOTHING servir de mutex diário — F-C3.';
COMMENT ON COLUMN cron_execucoes.concluido_em IS
  'NULL com iniciado_em antigo = execução que morreu no meio (lambda expirou). Um retry legítimo pode reclamar o lock nesse caso.';

ALTER TABLE cron_execucoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cron_execucoes FROM anon;
REVOKE ALL ON cron_execucoes FROM authenticated;

-- Rollback:
-- DROP TABLE IF EXISTS cron_execucoes;
