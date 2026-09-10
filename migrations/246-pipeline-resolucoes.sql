-- Resoluções auditáveis: preservar histórico sem contá-lo como defeito atual.
BEGIN;
ALTER TABLE public.videos_gerados ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.videos_gerados ADD COLUMN IF NOT EXISTS archive_reason text;
ALTER TABLE public.kit_briefs ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.kit_briefs ADD COLUMN IF NOT EXISTS archive_reason text;
ALTER TABLE public.degradacao_log ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.degradacao_log ADD COLUMN IF NOT EXISTS resolution text;
ALTER TABLE public.tts_qa_log ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.tts_qa_log ADD COLUMN IF NOT EXISTS resolution text;
ALTER TABLE public.tts_qa_log ADD COLUMN IF NOT EXISTS artifact_key text;
ALTER TABLE public.tts_qa_log ADD COLUMN IF NOT EXISTS synthesis_id uuid;
COMMENT ON COLUMN public.tts_qa_log.publicado IS 'Tentativa escolhida pelo sintetizador; não comprova upload, publicação ou reprodução. Resoluções e artifact_key identificam substituições verificadas.';
COMMENT ON COLUMN public.tts_qa_log.resolution IS 'Evidência da resolução; não alterar o veredito histórico ok/publicado.';
COMMIT;
NOTIFY pgrst, 'reload schema';
