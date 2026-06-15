-- Fila de render para o worker Hetzner (modelo PULL/poll). O job trigger.dev
-- orquestra (roteiro→TTS→HeyGen→inputProps) e ENFILEIRA o render; um worker
-- always-on (CX33) faz o claim atômico (FOR UPDATE SKIP LOCKED), renderiza com
-- Remotion e sobe pro Bunny. Mantém compatibilidade com o render no trigger.dev
-- (fallback via env RENDER_BACKEND=trigger).
ALTER TABLE videos_gerados
  ADD COLUMN IF NOT EXISTS render_inputprops jsonb,  -- SpikePropsV3 prontos p/ renderMedia
  ADD COLUMN IF NOT EXISTS render_scale numeric,     -- 0.667 = 720p · 1.0 = 1080p
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;   -- quando um worker pegou (p/ reaper)

-- Novos status: render_queued (na fila) e rendering (worker processando).
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
   WHERE conrelid = 'videos_gerados'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%status%';
  IF cname IS NOT NULL THEN EXECUTE 'ALTER TABLE videos_gerados DROP CONSTRAINT ' || quote_ident(cname); END IF;
END $$;
ALTER TABLE videos_gerados ADD CONSTRAINT videos_gerados_status_check
  CHECK (status IN ('processing', 'render_queued', 'rendering', 'done', 'error'));

-- Índice parcial da fila — torna o claim (SELECT ... FOR UPDATE SKIP LOCKED) barato.
CREATE INDEX IF NOT EXISTS idx_videos_gerados_fila
  ON videos_gerados (created_at)
  WHERE status IN ('render_queued', 'rendering');
