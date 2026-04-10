-- Cenários B: colunas p1-p4 para armazenar perguntas individuais
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS p1 TEXT;
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS p2 TEXT;
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS p3 TEXT;
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS p4 TEXT;
