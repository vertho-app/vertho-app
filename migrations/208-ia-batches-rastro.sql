-- 208 — Rastro dos batches da Anthropic (achado do gate de 10/08/2026).
--
-- `submitClaudeBatch` cria o batch, guarda o `batchId` numa VARIÁVEL LOCAL e faz
-- polling inline. Se a lambda morrer no meio — timeout, deploy trocando, erro não
-- tratado — o batch **continua rodando na Anthropic**: ele foi pago, produz o
-- resultado, e ninguém mais tem o id para buscá-lo. O trabalho some sem deixar
-- linha em lugar nenhum, porque o insert do resultado acontece DEPOIS.
--
-- Esta tabela é o rastro mínimo para que um batch pago possa ser recuperado:
-- o id existe fora da memória do processo desde o instante da submissão.
--
-- Sem policy de propósito: RLS ligada + zero policy = só service_role lê/escreve,
-- que é a postura correta para tabela sem consumidor de browser (ver mig 206).

CREATE TABLE IF NOT EXISTS ia_batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     text NOT NULL UNIQUE,           -- id da Anthropic (msgbatch_…)
  feature      text,                            -- mesma etiqueta do ledger
  empresa_id   uuid REFERENCES empresas(id) ON DELETE SET NULL,
  itens        integer NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'submetido'
                 CHECK (status IN ('submetido', 'concluido', 'erro')),
  erro         text,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz
);

-- O índice que o script de reconciliação usa: "quem está submetido há tempo
-- demais?" — a pergunta que encontra o batch órfão.
CREATE INDEX IF NOT EXISTS idx_ia_batches_pendentes
  ON ia_batches (criado_em) WHERE status = 'submetido';

ALTER TABLE ia_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ia_batches FROM anon, authenticated;
