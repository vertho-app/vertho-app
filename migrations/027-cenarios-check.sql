-- Colunas de validação de cenários (checkCenarios via Gemini)
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS nota_check INTEGER;
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS status_check TEXT; -- aprovado | revisar
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS dimensoes_check JSONB;
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS justificativa_check TEXT;
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS sugestao_check TEXT;
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS alertas_check JSONB DEFAULT '[]';
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ;
