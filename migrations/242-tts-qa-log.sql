-- 242 · Veredito do portão de deriva do TTS, persistido (fase 4 do plano de deriva, 06/09/2026).
-- Até aqui o veredito só existia no log da Vercel/Trigger: sem taxa de retake, sem
-- "publicou a menos ruim" contável, sem canário. Não é dado de tenant (empresa_id é
-- etiqueta de atribuição, como em ia_usage_log); acesso real via service-role.
BEGIN;
CREATE TABLE IF NOT EXISTS public.tts_qa_log (
  id               bigserial PRIMARY KEY,
  created_at       timestamptz NOT NULL DEFAULT now(),
  origem           text NOT NULL DEFAULT 'portao',          -- 'portao' | 'canario'
  feature          text NOT NULL,                           -- tts_podcast | tts_video_cena | tts_devolutiva | canario_tts
  voz              text NOT NULL,
  modelo           text,
  rotulo           text,
  tentativa        smallint NOT NULL,
  total_tentativas smallint NOT NULL,
  ok               boolean NOT NULL,
  publicado        boolean NOT NULL DEFAULT false,          -- esta tentativa foi a publicada
  motivos          text[] NOT NULL DEFAULT '{}',
  dur_s            numeric(8,2),
  janelas          smallint,
  fracao_vozeada   numeric(5,3),
  f0_med_hz        numeric(7,1),
  f0_amp_st        numeric(6,2),
  f0_slope_st_min  numeric(7,2),
  loud_slope_db_min numeric(7,2),
  loud_amp_db      numeric(6,2),
  timbre_max       numeric(6,3),
  timbre_vs_ref    numeric(6,3),                            -- distância à assinatura de referência da voz (σ)
  empresa_id       uuid,
  correlation_id   text
);
COMMENT ON TABLE public.tts_qa_log IS 'Veredito do portão de deriva do TTS por tentativa (lib/tts/deriva.ts via lib/gemini-tts.ts) e do canário semanal. Não é dado de tenant.';
COMMENT ON COLUMN public.tts_qa_log.publicado IS 'true na tentativa que virou o áudio entregue; ok=false com publicado=true = "publicou a menos ruim" (fail-open do portão).';
COMMENT ON COLUMN public.tts_qa_log.timbre_vs_ref IS 'Distância (σ, MFCC 1-12) da assinatura de timbre do take à assinatura de referência da voz (lib/tts/assinaturas-voz.ts). Identidade da locutora entre takes/modelos.';
COMMENT ON COLUMN public.tts_qa_log.origem IS 'portao = síntese de produção; canario = texto fixo semanal (cron canario_tts).';
CREATE INDEX IF NOT EXISTS tts_qa_log_created ON public.tts_qa_log (created_at DESC);
CREATE INDEX IF NOT EXISTS tts_qa_log_feature_created ON public.tts_qa_log (feature, created_at DESC);
ALTER TABLE public.tts_qa_log ENABLE ROW LEVEL SECURITY;
COMMIT;
