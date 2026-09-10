-- Um nominal done de uma composição antiga não pode impedir a atualização da voz.
-- Hash calculado pelo Postgres (a serialização jsonb é canônica).
ALTER TABLE public.videos_gerados
  ADD COLUMN IF NOT EXISTS render_fingerprint text
  GENERATED ALWAYS AS (md5(render_inputprops::text)) STORED;
ALTER TABLE public.videos_personalizados
  ADD COLUMN IF NOT EXISTS deck_fingerprint text;
-- Baseline antes de qualquer reparo de assets: preserva os nominais existentes.
UPDATE public.videos_personalizados p
SET deck_fingerprint = v.render_fingerprint
FROM public.videos_gerados v
WHERE p.cell_video_id = v.id AND p.deck_fingerprint IS NULL;
COMMENT ON COLUMN public.videos_personalizados.deck_fingerprint IS
  'Hash da composição efetivamente usada no nominal. Divergência pede atualização; vídeo anterior continua disponível até o novo terminar.';
NOTIFY pgrst, 'reload schema';
