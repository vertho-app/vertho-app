-- 004: Adicionar campo segmento na tabela empresas
-- Valores: 'educacao' ou 'corporativo'

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS segmento TEXT CHECK (segmento IN ('educacao', 'corporativo'));
