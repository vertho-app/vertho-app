-- Motor de Temporadas — Fase B
-- Estende trilhas com plano semanal (14 semanas) e cria assessment de descritores.

-- 1) Assessment por descritor (entrada do motor de temporadas)
CREATE TABLE IF NOT EXISTS descriptor_assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE CASCADE,
  cargo TEXT,
  competencia TEXT NOT NULL,
  descritor TEXT NOT NULL,
  nota NUMERIC NOT NULL CHECK (nota >= 1.0 AND nota <= 4.0),
  nivel TEXT GENERATED ALWAYS AS (
    CASE
      WHEN nota < 1.5 THEN 'inicial'
      WHEN nota < 2.5 THEN 'em_desenvolvimento'
      WHEN nota < 3.5 THEN 'proficiente'
      ELSE 'avancado'
    END
  ) STORED,
  origem TEXT DEFAULT 'manual',  -- manual | ia4 | autoavaliacao | reavaliacao
  assessment_date TIMESTAMPTZ DEFAULT now(),
  UNIQUE(colaborador_id, competencia, descritor)
);

CREATE INDEX IF NOT EXISTS idx_da_colab ON descriptor_assessments(colaborador_id, competencia);

ALTER TABLE descriptor_assessments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS da_service_all ON descriptor_assessments;
CREATE POLICY da_service_all ON descriptor_assessments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) Estende trilhas com plano de temporada (14 semanas com formato/desafio/cenário)
ALTER TABLE trilhas ADD COLUMN IF NOT EXISTS temporada_plano JSONB;
ALTER TABLE trilhas ADD COLUMN IF NOT EXISTS descritores_selecionados JSONB;
ALTER TABLE trilhas ADD COLUMN IF NOT EXISTS numero_temporada INT DEFAULT 1;

COMMENT ON COLUMN trilhas.temporada_plano IS 'Plano de 14 semanas (WeekPlan[]) — substitui cursos[] legado do Moodle';
COMMENT ON COLUMN trilhas.descritores_selecionados IS 'SelectedDescriptor[] com gap e alocação de semanas';

-- 3) Progresso semanal detalhado (extende fase4_progresso)
CREATE TABLE IF NOT EXISTS temporada_semana_progresso (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trilha_id UUID REFERENCES trilhas(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE CASCADE,
  semana INT NOT NULL CHECK (semana BETWEEN 1 AND 14),
  tipo TEXT NOT NULL CHECK (tipo IN ('conteudo','aplicacao','avaliacao')),
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluido')),
  conteudo_consumido BOOLEAN DEFAULT false,
  reflexao JSONB,        -- {desafio_realizado, relato, insight, compromisso, transcript[]}
  feedback JSONB,        -- {cenario_resposta, feedback_ia, autoavaliacao{}, transcript[]}
  iniciado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  UNIQUE(trilha_id, semana)
);

CREATE INDEX IF NOT EXISTS idx_tsp_trilha ON temporada_semana_progresso(trilha_id);
CREATE INDEX IF NOT EXISTS idx_tsp_colab ON temporada_semana_progresso(colaborador_id);

ALTER TABLE temporada_semana_progresso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tsp_service_all ON temporada_semana_progresso;
CREATE POLICY tsp_service_all ON temporada_semana_progresso FOR ALL TO service_role USING (true) WITH CHECK (true);
