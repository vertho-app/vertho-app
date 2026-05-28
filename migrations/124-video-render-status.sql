-- Render de vídeo IA (Veo + TTS + FFmpeg em Cloud Run Job).
-- Estado do render assíncrono por micro_conteúdo de formato 'video'.
-- O Next gera o plano + dispara o Job; o Job atualiza status/url ao concluir.

alter table public.micro_conteudos
  add column if not exists video_render_status text
    check (video_render_status in ('processing', 'done', 'error')),
  add column if not exists video_render_error text;

comment on column public.micro_conteudos.video_render_status is
  'Estado do render de vídeo IA (Veo+FFmpeg Cloud Run): processing | done | error. NULL = nunca gerado.';
comment on column public.micro_conteudos.video_render_error is
  'Última mensagem de erro do render de vídeo, quando video_render_status = error.';
