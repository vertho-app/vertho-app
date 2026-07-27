-- 190 · UNIQUE parcial em micro_conteudos NÃO-kit (F-C6 do docs/FMEA-PIPELINE.md).
--
-- `gerarConteudoIA` (actions/conteudos.ts:126-135) é SELECT-then-INSERT: a checagem
-- de idempotência por (empresa, competencia, descritor, formato, cargo) + kit_id NULL
-- não protege contra corrida — duas gerações simultâneas inserem duas linhas. Medido
-- em 27/07: 19 grupos duplicados (13 globais/demo, 6 Ibipeba, até 4×) — cresceu dos 6
-- de 17/07. O motor escolhe uma por score; as outras são peso morto que confunde
-- diagnóstico e a contagem do health_estrutural.
--
-- Dedup feito ANTES desta constraint (scripts/_dedup-micro-conteudos.mjs, 27/07):
-- 30 linhas apagadas em 19 grupos, 17 temporada_plano reapontados para a vencedora
-- (referenciada > score > versão > recente), backup em backups/micro-conteudos-dedup-*.
--
-- A chave espelha EXATAMENTE a query de idempotência — constraint e checagem em
-- código têm que casar, senão o insert falha onde a checagem não achou (ou vice-versa).
-- WHERE kit_id IS NULL: conteúdo de kit tem variantes por DISC no mesmo tuple e fica
-- fora da constraint (variante ≠ duplicata). COALESCE: dois NULLs não colidem em
-- UNIQUE, e empresa/descritor/cargo são anuláveis no baseline.
CREATE UNIQUE INDEX IF NOT EXISTS uq_micro_conteudos_core
  ON micro_conteudos (
    COALESCE(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid),
    competencia,
    COALESCE(descritor, ''),
    formato,
    COALESCE(cargo, '')
  )
  WHERE kit_id IS NULL;

COMMENT ON INDEX uq_micro_conteudos_core IS
  'F-C6: barra duplicata de conteúdo NÃO-kit por (empresa, competência, descritor, formato, cargo). gerarConteudoIA é SELECT-then-INSERT; sem esta constraint, gerações concorrentes do mesmo slot inseriam 2+ linhas. Kit tem variantes por DISC e fica fora (WHERE kit_id IS NULL).';

-- Rollback:
-- DROP INDEX IF EXISTS uq_micro_conteudos_core;
