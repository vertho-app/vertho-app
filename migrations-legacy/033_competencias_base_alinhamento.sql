-- Alinha competencias_base com competencias (empresa): adiciona
-- evidencias_esperadas + perguntas_alvo para uso em Fase 1 (IA3/IA4).
ALTER TABLE competencias_base ADD COLUMN IF NOT EXISTS evidencias_esperadas TEXT;
ALTER TABLE competencias_base ADD COLUMN IF NOT EXISTS perguntas_alvo TEXT;

COMMENT ON COLUMN competencias_base.evidencias_esperadas IS 'Critérios observáveis esperados (usado pela IA4 na avaliação das respostas)';
COMMENT ON COLUMN competencias_base.perguntas_alvo IS 'Perguntas-guia para geração de cenários (usado pela IA3)';
