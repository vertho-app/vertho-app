-- 040: impacto_no_delta por conteúdo
-- Atualmente micro_conteudos tem `taxa_conclusao` (proporção de colabs que terminaram).
-- Isso viesa ranking pra conteúdo "leve/popular" em vez de conteúdo que de fato
-- gera evolução. Adiciona `impacto_medio_delta` = média do delta de descritor
-- nas trilhas em que o conteúdo foi usado. Populado por job/trigger separado.

ALTER TABLE micro_conteudos
  ADD COLUMN IF NOT EXISTS impacto_medio_delta NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS impacto_amostras INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impacto_atualizado_em TIMESTAMPTZ;

COMMENT ON COLUMN micro_conteudos.impacto_medio_delta IS 'Delta médio (nota_pos - nota_pre) observado em trilhas que usaram este conteúdo pro descritor. NULL = amostra insuficiente.';
COMMENT ON COLUMN micro_conteudos.impacto_amostras IS 'Número de trilhas concluídas que consumiram este conteúdo. Impacto só é considerado confiável com amostras >= 5.';
