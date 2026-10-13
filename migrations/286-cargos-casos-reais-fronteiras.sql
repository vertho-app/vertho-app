-- 286: casos reais do gestor e fronteiras do cargo, em `cargos_empresa`.
--
-- Plano de cenários de 11/10/2026, Fase 3 (aprovada pelo dono em 13/10/2026). Na reunião de
-- 09/10 a Amazon Bowling disse que os cenários eram "situações fictícias": sem situação real
-- no insumo, o gerador inventava fato técnico e papel do cargo. Duas colunas novas:
--
--  - `casos_reais` (jsonb): situações reais que o gestor descreve pela planilha de cargos, um
--    caso por competência do cargo, sem nome de cliente nem de colega: `[{"texto": "..."}]`.
--    O gerador v2 de cenários (opt-in, `lib/ia3-cenarios-v2.ts`) parte do caso da competência
--    e não acrescenta fatos.
--  - `fronteiras` (text): o que o cargo NÃO faz, quem faz no lugar e o que é terceirizado.
--    Entra na ficha do cargo (`lib/cargo-contexto.ts::linhasDaFicha`), e com isso chega aos
--    cenários e aos geradores semanais.
--
-- Não reaproveita `tensoes_comuns`: ela alimenta o IA2, a devolutiva comportamental e os
-- geradores semanais com outro sentido.
--
-- Aditiva e idempotente: colunas novas, nulas, sem default e sem backfill.

ALTER TABLE public.cargos_empresa
  ADD COLUMN IF NOT EXISTS casos_reais jsonb,
  ADD COLUMN IF NOT EXISTS fronteiras text;

COMMENT ON COLUMN public.cargos_empresa.casos_reais IS
  'Casos reais do gestor, um por competência do cargo, sem nome de pessoa: [{"texto": "..."}]. Insumo do gerador v2 de cenários (plano de 11/10/2026).';
COMMENT ON COLUMN public.cargos_empresa.fronteiras IS
  'O que o cargo não faz, quem faz no lugar e o que é terceirizado. Entra na ficha do cargo (lib/cargo-contexto.ts).';

-- A API REST (PostgREST) só enxerga a coluna nova depois de recarregar o cache de schema.
NOTIFY pgrst, 'reload schema';

-- Rollback (só se nenhum código ler as colunas):
-- ALTER TABLE public.cargos_empresa DROP COLUMN IF EXISTS casos_reais, DROP COLUMN IF EXISTS fronteiras;
