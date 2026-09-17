-- `video_publicacoes.colaborador_id` era a única FK para `colaboradores` sem
-- ON DELETE (mig 248). Excluir quem tem vídeo nominal publicado falhava com
-- 23503: o reset noturno do `escolas-acme` abortou em 16/09 e 17/09/2026 depois
-- de já ter apagado trilhas, avaliações e cenários, e a exclusão de colaborador
-- no admin travava do mesmo jeito para qualquer pessoa com vídeo nominal.
--
-- A linha é a publicação de uma pessoa que deixou de existir, e
-- `videos_personalizados` já cascateia pela mesma razão. SET NULL não serve:
-- `colaborador_id` nulo significa publicação do deck GENÉRICO da célula.
alter table public.video_publicacoes
  drop constraint video_publicacoes_colaborador_id_fkey,
  add constraint video_publicacoes_colaborador_id_fkey
    foreign key (colaborador_id) references public.colaboradores(id) on delete cascade;
