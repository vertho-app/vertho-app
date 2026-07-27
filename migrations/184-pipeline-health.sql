-- 184 · Health-check do pipeline: histórico de execuções e achados.
--
-- Por que esta tabela existe: o veredito do docs/FMEA-PIPELINE.md é que o pipeline
-- degrada em SILÊNCIO — "quase toda falha vira conteúdo genérico, placeholder ou
-- ausência, sem erro, sem alerta, sem telemetria". Três dos quatro problemas
-- encontrados em 27/07 (texto da pílula prometendo formato inexistente, carimbo
-- sobrevivendo à falha de envio, resolvedores divergentes) JÁ estavam catalogados
-- no FMEA desde 17/07. Documentar não protegeu ninguém: faltava algo que rodasse
-- sozinho, medisse e reclamasse.
--
-- O histórico é o que transforma o check em sinal: sem ele não dá para dizer se um
-- número piorou. Exemplo real: `videos_gerados` duplicados por célula eram 18 em
-- 17/07 e 22 em 27/07 — cresce sozinho porque não há UNIQUE. Uma foto não mostra
-- isso; a série mostra.

CREATE TABLE IF NOT EXISTS pipeline_health_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'preflight' (antes da entrega, com folga p/ corrigir), 'postflight' (confere o
  -- que saiu), 'estrutural' (integridade que independe de entrega).
  modo          text NOT NULL CHECK (modo IN ('preflight', 'postflight', 'estrutural')),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,  -- null = varredura global
  -- Data da ENTREGA avaliada (não a data do run): o preflight de hoje avalia amanhã.
  data_alvo     date,
  severidade    text NOT NULL CHECK (severidade IN ('ok', 'aviso', 'critico')),
  total_achados int  NOT NULL DEFAULT 0,
  -- Achados completos: [{ id, severidade, titulo, contagem, detalhe, amostra[] }]
  achados       jsonb NOT NULL DEFAULT '[]'::jsonb,
  duracao_ms    int,
  erro          text,           -- o próprio check falhou (≠ achar problema)
  alertado_em   timestamptz,    -- quando o alerta saiu (null = não alertou)
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_runs_lookup
  ON pipeline_health_runs (empresa_id, modo, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_health_runs_severidade
  ON pipeline_health_runs (severidade, criado_em DESC)
  WHERE severidade <> 'ok';

COMMENT ON TABLE pipeline_health_runs IS
  'Execuções do health-check do pipeline (lib/pipeline-health). Uma linha por run; achados em JSONB.';
COMMENT ON COLUMN pipeline_health_runs.data_alvo IS
  'Data da ENTREGA avaliada. O preflight roda na véspera: data_alvo = amanhã.';
COMMENT ON COLUMN pipeline_health_runs.erro IS
  'Preenchido quando o CHECK falhou (exceção). Diferente de achar problema — check que não roda é o pior caso: silêncio que parece silêncio bom.';

-- Rollback:
-- DROP TABLE IF EXISTS pipeline_health_runs;
