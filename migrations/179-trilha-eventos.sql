-- 179: trilha_eventos — log append-only de ABERTURA de conteúdo da trilha.
-- Preenche o buraco de telemetria: "quem abriu o deep-link da pílula" + atribuição
-- por pílula/semana/formato. (Playback de vídeo já vive em videos_watched; consumo
-- explícito em temporada_semana_progresso.conteudo_consumido.) Idempotente.

CREATE TABLE IF NOT EXISTS public.trilha_eventos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id uuid REFERENCES colaboradores(id) ON DELETE SET NULL,
  trilha_id      uuid REFERENCES trilhas(id) ON DELETE CASCADE,
  semana         int,
  pilula         smallint,                       -- 1|2 (DUO) ou NULL (abertura direta/navegação)
  formato        text,                           -- video|audio|texto|case (do deep-link) ou NULL
  tipo           text NOT NULL DEFAULT 'abertura', -- extensível (abertura|...)
  criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trilha_eventos_empresa_semana ON public.trilha_eventos (empresa_id, semana);
CREATE INDEX IF NOT EXISTS idx_trilha_eventos_colab          ON public.trilha_eventos (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_trilha_eventos_trilha         ON public.trilha_eventos (trilha_id);

ALTER TABLE public.trilha_eventos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trilha_eventos'
      AND policyname='trilha_eventos_service_all'
  ) THEN
    CREATE POLICY "trilha_eventos_service_all" ON public.trilha_eventos
      AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
