-- Extração de vídeo assíncrona (Fase 3 — worker Cloud Run com yt-dlp).
-- Status do processamento em background de um micro_conteudo de vídeo.
ALTER TABLE micro_conteudos
  ADD COLUMN IF NOT EXISTS extracao_status TEXT,   -- processing | done | error
  ADD COLUMN IF NOT EXISTS extracao_error  TEXT,
  ADD COLUMN IF NOT EXISTS extracao_em      TIMESTAMPTZ;
