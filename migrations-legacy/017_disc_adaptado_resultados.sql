-- 017: Colunas DISC adaptado + resultados completos do mapeamento

ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS d_adaptado NUMERIC,
  ADD COLUMN IF NOT EXISTS i_adaptado NUMERIC,
  ADD COLUMN IF NOT EXISTS s_adaptado NUMERIC,
  ADD COLUMN IF NOT EXISTS c_adaptado NUMERIC,
  ADD COLUMN IF NOT EXISTS disc_resultados JSONB;
