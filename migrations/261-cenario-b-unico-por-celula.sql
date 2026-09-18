-- 261: um Cenário B por célula (empresa × cargo × competência).
--
-- O lote da Fase 5 gerava um B por cenário A. Numa rede há um A por PPP, e a
-- mesma célula recebia N B de uma vez (FMEA F-C14: 12 B em Ibipeba, 01/09/2026).
-- O código agora agrupa por célula e relê antes de gravar, mas duas execuções
-- simultâneas (duplo clique, ou retry depois dos 300 s da action) ainda passariam
-- as duas pela releitura. Este índice é a garantia no banco: o 2º insert da
-- célula recebe 23505, e o lote trata como "já existe".
--
-- Medido em 18/09/2026, antes de criar: nenhum B atual repete (cargo,
-- competencia_id) na mesma empresa, e nenhum tem competencia_id nulo. O índice
-- nasce sem limpar nada. A regeneração atualiza a linha no lugar (UPDATE), então
-- não esbarra nele. O reset de demo apaga os B do tenant antes de reinserir.
--
-- Índice PARCIAL: PostgREST não usa índice parcial em ON CONFLICT, e é por isso
-- que o código faz insert simples e lê o 23505, sem upsert.
--
-- Idempotente (IF NOT EXISTS). Sem CONCURRENTLY: banco_cenarios tem centenas de
-- linhas, e o apply-migration roda o arquivo numa transação só.

CREATE UNIQUE INDEX IF NOT EXISTS uq_banco_cenarios_b_celula
  ON public.banco_cenarios (empresa_id, cargo, competencia_id)
  WHERE tipo_cenario = 'cenario_b';

NOTIFY pgrst, 'reload schema';
