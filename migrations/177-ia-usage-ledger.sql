-- 177: ia_usage_log vira o LEDGER central de IA (Sprint 1 do plano de custo).
--
-- A tabela existe desde a mig 038, mas só o tira-dúvidas grava — e com tokens
-- ESTIMADOS (length/4). Esta migration a estende para receber o usage REAL de
-- toda chamada de IA, gravado DENTRO do wrapper (actions/ai-client.ts), para
-- todos os provedores (Claude sync+streaming, Gemini, OpenAI).
--
-- Colunas novas são todas NULLABLE (aditiva, zero impacto no insert atual do
-- tira-dúvidas). `feature` (NOT NULL, já existente) carrega o task_key;
-- chamadas ainda não etiquetadas entram como 'untagged'.

ALTER TABLE public."ia_usage_log"
  ADD COLUMN IF NOT EXISTS "provider" text,               -- anthropic | gemini | openai
  ADD COLUMN IF NOT EXISTS "cache_read_tokens" integer,   -- tokens lidos do prompt cache (0,1x)
  ADD COLUMN IF NOT EXISTS "cache_write_tokens" integer,  -- tokens escritos no cache (1,25x)
  ADD COLUMN IF NOT EXISTS "cost_usd" numeric(12,6),      -- custo calculado na tabela vigente (null = modelo fora do catálogo)
  ADD COLUMN IF NOT EXISTS "latency_ms" integer,
  ADD COLUMN IF NOT EXISTS "status" text,                 -- ok | error
  ADD COLUMN IF NOT EXISTS "requested_model" text,        -- modelo pedido (difere de model em fallback)
  ADD COLUMN IF NOT EXISTS "source" text;                 -- wrapper | route | batch

-- Agregação por task/período (o painel estimado-vs-real consulta por aqui).
CREATE INDEX IF NOT EXISTS idx_ia_usage_feature_created
  ON public."ia_usage_log" (feature, created_at);

NOTIFY pgrst, 'reload schema';
