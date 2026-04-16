-- Gap 1: colunas pra persistir o Evolution Report no final da temporada
ALTER TABLE trilhas ADD COLUMN IF NOT EXISTS evolution_report JSONB;
ALTER TABLE trilhas ADD COLUMN IF NOT EXISTS evolution_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN trilhas.evolution_report IS 'Relatório final da temporada consolidando semana 13 (qualitativa) + semana 14 (cenário quantitativo): evolucao_por_descritor[] com convergência (confirmada/parcial/estagnacao/regressao), nota_pre, nota_pos, insight_geral';
