-- 039: checkpoint humano do gestor durante a trilha
-- Gestor valida progresso do liderado nas sems 5 e 10 (midpoints), não só no fim.
-- Evita depender 100% da IA + sinaliza quando o colab está estagnando cedo.

CREATE TABLE IF NOT EXISTS checkpoints_gestor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trilha_id UUID NOT NULL REFERENCES trilhas(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  gestor_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  semana INTEGER NOT NULL CHECK (semana IN (5, 10)),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'validado', 'alerta')),
  observacao TEXT,
  avaliacao_gestor TEXT CHECK (avaliacao_gestor IN ('evoluindo', 'estagnado', 'regredindo')),
  created_at TIMESTAMPTZ DEFAULT now(),
  validado_em TIMESTAMPTZ,
  UNIQUE(trilha_id, semana)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_gestor ON checkpoints_gestor (gestor_id, status);
CREATE INDEX IF NOT EXISTS idx_checkpoints_trilha ON checkpoints_gestor (trilha_id);

ALTER TABLE checkpoints_gestor ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE checkpoints_gestor IS 'Validação humana do gestor em pontos-chave da trilha (sems 5 e 10). Sinaliza alertas precocemente.';
