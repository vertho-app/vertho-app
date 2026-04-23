-- 052: Adiciona scores de aderência ao top10_cargos
--
-- aderencia_cargo: quanto a competência é exigida no dia a dia do cargo (0-1)
-- aderencia_mercado: quanto responde a desafios/oportunidades de mercado (0-1)
-- motivo: frase curta explicando POR QUE esta competência importa para o cargo

ALTER TABLE top10_cargos ADD COLUMN IF NOT EXISTS aderencia_cargo NUMERIC;
ALTER TABLE top10_cargos ADD COLUMN IF NOT EXISTS aderencia_mercado NUMERIC;
ALTER TABLE top10_cargos ADD COLUMN IF NOT EXISTS motivo TEXT;
