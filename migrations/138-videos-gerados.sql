-- Geração de VÍDEO a partir de um Módulo-Base (avatar HeyGen + cenas Remotion +
-- narração TTS própria). Rastreia o pipeline assíncrono (job trigger.dev):
-- roteiro → narração (TTS) → avatar (HeyGen) → render (Remotion chunked) → Bunny.
CREATE TABLE IF NOT EXISTS videos_gerados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_base_id uuid NOT NULL REFERENCES modulos_base_conteudo(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES empresas(id) ON DELETE CASCADE, -- alcance (NULL = global/canônico)
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'error')),
  etapa text,                       -- progresso fino: roteiro | narracao | avatar | render | upload
  roteiro jsonb,                    -- VideoRoteiro (5 cenas)
  assets jsonb,                     -- { sceneId: { src, durationSec, kind } }
  job_id text,                      -- run id do trigger.dev (render)
  bunny_video_id text,
  bunny_library text,
  video_url text,                   -- player/iframe Bunny
  srt text,
  vtt text,
  error text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_videos_gerados_modulo
  ON videos_gerados (modulo_base_id, created_at DESC);

-- Admin-only: RLS habilitada sem policy pública (service-role do app ignora RLS).
ALTER TABLE videos_gerados ENABLE ROW LEVEL SECURITY;
