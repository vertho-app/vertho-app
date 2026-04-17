-- 050: Corrige unicidade em relatorios para colaborador_id NULL
--
-- Problema: UNIQUE(empresa_id, colaborador_id, tipo) não impede
-- duplicatas quando colaborador_id IS NULL (PostgreSQL trata NULL
-- como distinto em unique constraints).
--
-- O código usa upsert com onConflict:'empresa_id,colaborador_id,tipo'
-- para relatórios agregados (rh_manual, plenaria_relatorio, etc.)
-- onde colaborador_id = NULL. Sem tratamento, ambientes novos
-- podem acumular linhas duplicadas.
--
-- Solução: dois índices únicos complementares:
-- 1. Para linhas com colaborador_id: UNIQUE já existe (constraint da 048)
-- 2. Para linhas sem colaborador_id: índice parcial WHERE colaborador_id IS NULL

-- Índice parcial para relatórios agregados (colaborador_id NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_relatorios_empresa_tipo_null_colab
  ON relatorios (empresa_id, tipo)
  WHERE colaborador_id IS NULL;
