-- 028: Tracking de reprodução de vídeos do Bunny Stream (Fase 2 — atribuição user-level)
--
-- Cada registro representa UM evento de reprodução (play, finish, progress)
-- disparado pelo webhook do Bunny Stream. O parâmetro `metaData` passado no
-- iframe identifica o colaborador — a action do webhook faz a pont → UUID.

CREATE TABLE IF NOT EXISTS videos_watched (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  event_type TEXT,             -- 'play_started', 'play_finished', etc
  video_length INTEGER,
  seconds_watched INTEGER,
  country TEXT,
  os TEXT,
  browser TEXT,
  raw_payload JSONB,           -- payload completo do webhook (debug/reprocess)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vw_colab ON videos_watched(colaborador_id, video_id);
CREATE INDEX IF NOT EXISTS idx_vw_empresa ON videos_watched(empresa_id);
CREATE INDEX IF NOT EXISTS idx_vw_video ON videos_watched(video_id);
