-- Extração por MODELO DA EMPRESA: um módulo-base pode ser chaveado pela
-- competência CANÔNICA (competencia_base_id) OU pela competência da EMPRESA
-- (competencia_id → competencias). Empresas como Macaé têm pilares próprios
-- (ex.: Empreendedorismo) que não existem no catálogo canônico; quando a extração
-- é escopada a uma empresa, o segmentador usa o catálogo DELA e o módulo aponta
-- para competencia_id. Ver docs/MODULOS-BASE-CONTEUDO.md.

ALTER TABLE modulos_base_conteudo
  ADD COLUMN IF NOT EXISTS competencia_id uuid REFERENCES competencias(id) ON DELETE SET NULL;

-- competencia_base_id deixa de ser obrigatória (módulos da empresa não têm base).
ALTER TABLE modulos_base_conteudo
  ALTER COLUMN competencia_base_id DROP NOT NULL;

-- Garante que o módulo SEMPRE tem uma das duas referências.
ALTER TABLE modulos_base_conteudo
  DROP CONSTRAINT IF EXISTS chk_modulo_competencia;
ALTER TABLE modulos_base_conteudo
  ADD CONSTRAINT chk_modulo_competencia
  CHECK (competencia_base_id IS NOT NULL OR competencia_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_modulos_base_competencia_id
  ON modulos_base_conteudo (competencia_id) WHERE competencia_id IS NOT NULL;
