-- 257 — Cargo no direcionamento da extração de material/vídeo → módulo-base.
--
-- POR QUE EXISTE (16/09/2026)
--
--   A matriz de competências é gravada POR CARGO, e o mesmo NOME de competência
--   existe em cargos diferentes com descritores diferentes (Ibipeba: "Autocuidado
--   e resiliência emocional" em Coordenação/COO03 e Gestão Escolar/DIR02). O
--   catálogo que a extração oferece à IA agrupava por nome: o módulo ancorava na
--   linha de um cargo qualquer e o descritor podia sair da matriz do outro.
--
--   O catálogo passa a ser por MATRIZ (lib/matriz-por-cargo), e o direcionamento
--   ganha o cargo para desambiguar. A extração assíncrona (worker/task) lê o
--   direcionamento desta tabela depois de a linha existir — por isso coluna, e
--   não só parâmetro. Nula = sem cargo (comportamento de antes).
--
-- Aplicar ANTES do deploy do código que seleciona a coluna (select com coluna
-- inexistente derruba a query inteira no PostgREST).

ALTER TABLE public.extracoes_video
  ADD COLUMN IF NOT EXISTS cargo_direcionador text;

COMMENT ON COLUMN public.extracoes_video.cargo_direcionador IS
  'Cargo cuja matriz orienta a extração (desambigua competências de mesmo nome em cargos com descritores diferentes). Nulo = sem cargo.';

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar):
-- ALTER TABLE public.extracoes_video DROP COLUMN IF EXISTS cargo_direcionador;
