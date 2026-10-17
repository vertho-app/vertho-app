-- 290: plano visual da biblioteca v7 junto do vídeo (17/10/2026).
--
-- E3 da migração do vídeo para a biblioteca v7: para o cliente com
-- `sys_config.video_biblioteca_v7` ligada, o `gerar-video-modulo` pede ao Opus 5.5 o
-- plano visual do miolo (modelo e dados de cada momento, ancorados nas frases do
-- Whisper), gera as duas ilustrações e grava tudo aqui (`lib/video/v7/no-trigger.ts`).
-- O render no formato novo (E4) lê esta coluna. Sem a chave do cliente, nada escreve.
--
-- Fora de `render_inputprops` de propósito: a mig 247 calcula o hash da revisão do
-- vídeo personalizado sobre ele, e o plano mudaria o hash.
--
-- Custo do plano e das ilustrações: `ia_usage_log.correlation_id` = id do vídeo.
--
-- Reverter: ALTER TABLE public.videos_gerados DROP COLUMN IF EXISTS visual_v7;

ALTER TABLE public.videos_gerados ADD COLUMN IF NOT EXISTS visual_v7 jsonb;

COMMENT ON COLUMN public.videos_gerados.visual_v7 IS
  'Plano visual da biblioteca v7 (momentos, ilustrações, ajustes e avisos), escrito pelo gerar-video-modulo quando a empresa tem sys_config.video_biblioteca_v7 ligada. Lido pelo render no formato novo.';
