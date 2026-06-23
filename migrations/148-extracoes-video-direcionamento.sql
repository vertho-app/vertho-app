-- Direcionamento opcional da extração para ajudar a IA a mapear pilar/competência.
-- Usado principalmente em materiais enviados em background, onde o worker precisa
-- recuperar a pista depois que a linha de extracoes_video já foi criada.
ALTER TABLE public.extracoes_video
  ADD COLUMN IF NOT EXISTS pilar_direcionador text,
  ADD COLUMN IF NOT EXISTS competencia_direcionadora text,
  ADD COLUMN IF NOT EXISTS competencia_base_id_direcionadora uuid REFERENCES public.competencias_base(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_extracoes_video_direcionamento_base
  ON public.extracoes_video (competencia_base_id_direcionadora)
  WHERE competencia_base_id_direcionadora IS NOT NULL;
