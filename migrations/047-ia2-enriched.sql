-- 047: Enriquece saída da IA2 (gabarito CIS por cargo)
-- Coluna para confiança média do gabarito gerado pela IA2
ALTER TABLE cargos_empresa ADD COLUMN IF NOT EXISTS confianca_media_ia2 NUMERIC;
COMMENT ON COLUMN cargos_empresa.confianca_media_ia2 IS 'Confiança média da IA2 nas 4 telas (0.0-1.0)';
