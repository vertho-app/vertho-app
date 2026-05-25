-- ═════════════════════════════════════════════════════════════════
-- Migration 115 — Matrículas (QT_MAT) no Censo Escolar
-- O Catálogo de Escolas (Tabela_Escola) não traz matrículas; elas vêm
-- dos microdados ed_básica (QT_MAT_BAS = total educação básica + os
-- recortes por etapa QT_MAT_INF/FUND/MED/... que já caem em `quantidades`).
-- Esta coluna materializa o total pra consulta/exibição rápida; o
-- detalhamento por etapa continua disponível em `quantidades`.
-- ═════════════════════════════════════════════════════════════════

ALTER TABLE diag_censo_infra
  ADD COLUMN IF NOT EXISTS matriculas INT;   -- QT_MAT_BAS (total educação básica)

COMMENT ON COLUMN diag_censo_infra.matriculas IS
  'Total de matrículas na educação básica (Censo Escolar QT_MAT_BAS). Recortes por etapa em quantidades (QT_MAT_INF/FUND/MED/EJA/ESP/PROF).';

-- Backfill: para linhas já importadas de uma fonte que tenha QT_MAT_BAS
-- (microdados), materializa a partir do JSONB. Catálogo-only não tem a chave
-- → fica NULL (correto: matrícula desconhecida, não zero).
UPDATE diag_censo_infra
   SET matriculas = NULLIF(quantidades->>'QT_MAT_BAS', '')::int
 WHERE matriculas IS NULL
   AND quantidades ? 'QT_MAT_BAS';

-- Índice parcial pra rankings/filtros por porte (só linhas com matrícula)
CREATE INDEX IF NOT EXISTS idx_diag_censo_matriculas
  ON diag_censo_infra(matriculas DESC)
  WHERE matriculas IS NOT NULL;
