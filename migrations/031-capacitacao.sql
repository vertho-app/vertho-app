-- Fase 3 Capacitação: evolução da tabela fase4_progresso + tutor log

-- Novas colunas em fase4_progresso
ALTER TABLE fase4_progresso ADD COLUMN IF NOT EXISTS moodle_user_id INTEGER;
ALTER TABLE fase4_progresso ADD COLUMN IF NOT EXISTS cursos_progresso JSONB DEFAULT '[]'::jsonb;
ALTER TABLE fase4_progresso ADD COLUMN IF NOT EXISTS pct_conclusao INTEGER DEFAULT 0;
ALTER TABLE fase4_progresso ADD COLUMN IF NOT EXISTS ultimo_sync TIMESTAMPTZ;
ALTER TABLE fase4_progresso ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMPTZ;
ALTER TABLE fase4_progresso ADD COLUMN IF NOT EXISTS nudge_enviado_em TIMESTAMPTZ;
ALTER TABLE fase4_progresso ADD COLUMN IF NOT EXISTS competencia_foco TEXT;
ALTER TABLE fase4_progresso ADD COLUMN IF NOT EXISTS contrato JSONB;

-- Tabela de log do tutor IA
CREATE TABLE IF NOT EXISTS tutor_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  semana INTEGER,
  competencia TEXT,
  pergunta TEXT,
  resposta TEXT,
  modelo TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tutor_log_empresa ON tutor_log(empresa_id);
CREATE INDEX IF NOT EXISTS idx_tutor_log_colab ON tutor_log(colaborador_id);
