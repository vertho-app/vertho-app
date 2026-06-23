-- Jobs de geração de Kit Semanal em BACKGROUND (trigger.dev). A geração faz N
-- chamadas de IA (núcleo + desafio + formatos × DISC) → longa demais p/ server
-- action síncrono. O job roda no trigger e a tela faz polling do progresso.
CREATE TABLE IF NOT EXISTS kit_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid REFERENCES empresas(id) ON DELETE CASCADE,
  competencia  text NOT NULL,
  descritor    text NOT NULL,
  params       jsonb NOT NULL,            -- {nivelMin,nivelMax,cargo,contexto,discs,renderAudio}
  status       text NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','running','done','error')),
  progress     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {done,total,current,kits:[...]}
  kit_ids      jsonb,                     -- ids dos kits gerados
  error        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kit_jobs_recent ON kit_jobs (created_at DESC);
