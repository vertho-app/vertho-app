-- Gabarito CIS (4 telas) por cargo — resultado da IA2
ALTER TABLE cargos_empresa ADD COLUMN IF NOT EXISTS gabarito JSONB DEFAULT NULL;
-- Raciocínio estruturado da IA2
ALTER TABLE cargos_empresa ADD COLUMN IF NOT EXISTS raciocinio_ia2 JSONB DEFAULT NULL;
