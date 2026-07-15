-- 180: semana em videos_watched — permite filtrar playback de vídeo por semana na
-- tela de engajamento. Propagado do metaData do embed (useBunnyTracking →
-- registrarVideoWatched). Eventos legados ficam NULL (semana desconhecida); a tela
-- conta NULL em todos os filtros de semana. Idempotente.

ALTER TABLE public.videos_watched ADD COLUMN IF NOT EXISTS semana int;
CREATE INDEX IF NOT EXISTS idx_videos_watched_empresa_semana ON public.videos_watched (empresa_id, semana);

NOTIFY pgrst, 'reload schema';
