-- Jobs do pipeline de IA em LOTE (trigger.dev + Anthropic Batch API, −50%). O
-- runner do pipeline (page.tsx) roda o IA2 síncrono (1 cargo por request); o modo
-- "Em lote" enfileira um job aqui, dispara a task `gerar-ia2-batch` (Batch API,
-- assíncrona) e a tela faz polling de `progress`. Espelha `kit_jobs` (mig 144).
CREATE TABLE IF NOT EXISTS ia_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid REFERENCES empresas(id) ON DELETE CASCADE,
  fase         text NOT NULL,                        -- 'ia2' (aberto p/ outras fases)
  params       jsonb NOT NULL,                        -- {aiConfig, cargos, runId?}
  status       text NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','running','done','error','cancelled')),
  progress     jsonb NOT NULL DEFAULT '{}'::jsonb,    -- {done,total,current,resultados:[...]}
  result_ids   jsonb,                                 -- cargos com gabarito gravado
  error        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ia_jobs_recent ON ia_jobs (empresa_id, created_at DESC);
