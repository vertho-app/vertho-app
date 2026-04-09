-- Competência foco por cargo (definida pelo RH para priorizar na trilha)
ALTER TABLE cargos_empresa ADD COLUMN IF NOT EXISTS competencia_foco TEXT;

-- Competência foco na trilha (registra qual competência foi selecionada)
ALTER TABLE trilhas ADD COLUMN IF NOT EXISTS competencia_foco TEXT;
