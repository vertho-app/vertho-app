-- 046: Enriquece saída da IA1 (Top 10 por cargo)
--
-- Per-competência: confiança, evidências, papel na cobertura
-- Per-cargo: resultado geral (quase_entrou, resumo_executivo)

ALTER TABLE top10_cargos ADD COLUMN IF NOT EXISTS confianca NUMERIC;
ALTER TABLE top10_cargos ADD COLUMN IF NOT EXISTS evidencias JSONB DEFAULT '[]'::jsonb;
ALTER TABLE top10_cargos ADD COLUMN IF NOT EXISTS papel_na_cobertura TEXT;

ALTER TABLE cargos_empresa ADD COLUMN IF NOT EXISTS ia1_resultado JSONB;

COMMENT ON COLUMN top10_cargos.confianca IS 'Confiança da IA na seleção (0.0 a 1.0)';
COMMENT ON COLUMN top10_cargos.evidencias IS 'Evidências do caso que sustentam a seleção (array de strings)';
COMMENT ON COLUMN top10_cargos.papel_na_cobertura IS 'Papel desta competência na cobertura do cargo';
COMMENT ON COLUMN cargos_empresa.ia1_resultado IS 'Resultado completo da IA1: quase_entrou, resumo_executivo';
