-- Optional editorial hint for content classification.
-- Example: pilar = 'Empreendedorismo' narrows AI tag suggestions toward
-- company-specific competencies in that pillar without replacing competencia.
ALTER TABLE public.micro_conteudos
  ADD COLUMN IF NOT EXISTS pilar text;

CREATE INDEX IF NOT EXISTS idx_micro_conteudos_pilar
  ON public.micro_conteudos (pilar)
  WHERE pilar IS NOT NULL;
