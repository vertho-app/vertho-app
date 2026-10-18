-- 291: o hash da revisão do vídeo passa a incluir o plano visual da biblioteca v7 (18/10/2026).
--
-- `render_fingerprint` (mig 247) é a revisão do deck: o worker só refaz o vídeo nominal de quem tem
-- `videos_personalizados.deck_fingerprint` diferente dele, e a publicação na Bunny e a reconciliação comparam por ele.
-- Era md5(render_inputprops), e a 290 deixou o plano (`visual_v7`) fora de propósito. `Medido 18/10/2026` no piloto da
-- 4Life: converter um vídeo pronto para o formato novo manteve o hash, e o worker pulou os 5 nominais ("0 ok, 0 erro"),
-- deixando as pessoas com o vídeo antigo. O deck mudou de cara; a revisão tem que mudar junto.
--
-- Entra a ASSINATURA do plano (as cenas, as frases e a versão da biblioteca), não o JSON inteiro: um retry que reaproveita
-- o mesmo plano não muda o hash. Sem plano, o texto concatenado é o mesmo de antes, então o hash das linhas sem
-- `visual_v7` (todas, menos 3 em 18/10) não muda e nada é refeito.
--
-- Postgres 17: SET EXPRESSION troca a fórmula e recalcula a coluna sem recriá-la (sem índice nem view dependente).
--
-- Reverter: ALTER TABLE public.videos_gerados ALTER COLUMN render_fingerprint SET EXPRESSION AS (md5(render_inputprops::text));

ALTER TABLE public.videos_gerados
  ALTER COLUMN render_fingerprint SET EXPRESSION AS (md5(render_inputprops::text || coalesce(visual_v7->>'assinatura', '')));

COMMENT ON COLUMN public.videos_gerados.render_fingerprint IS
  'Revisão do deck: md5 do render_inputprops + assinatura do plano visual v7 (visual_v7->>''assinatura''). Nominal com deck_fingerprint diferente é refeito.';

NOTIFY pgrst, 'reload schema';
