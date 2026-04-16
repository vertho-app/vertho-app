-- 009: Motor Conversacional Fase 3 — sessões e mensagens de avaliação

-- Sessões de avaliação conversacional
CREATE TABLE IF NOT EXISTS sessoes_avaliacao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id  UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  competencia_id  UUID REFERENCES competencias(id) ON DELETE SET NULL,
  competencia_nome TEXT,
  cenario_id      UUID REFERENCES banco_cenarios(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'em_andamento'
                    CHECK (status IN ('em_andamento', 'concluido', 'erro')),
  fase            TEXT NOT NULL DEFAULT 'cenario'
                    CHECK (fase IN ('cenario', 'aprofundamento', 'contraexemplo', 'encerramento', 'concluida')),
  aprofundamentos INT DEFAULT 0,
  confianca       INT DEFAULT 0,
  evidencias      JSONB DEFAULT '[]',
  avaliacao_final JSONB,          -- resultado completo [EVAL]
  nivel           INT,             -- 1-4
  nota_decimal    NUMERIC(4,2),    -- ex: 2.45
  lacuna          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessoes_aval_colab ON sessoes_avaliacao(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_aval_empresa ON sessoes_avaliacao(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_aval_status ON sessoes_avaliacao(empresa_id, status);

-- Mensagens do chat
CREATE TABLE IF NOT EXISTS mensagens_chat (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id   UUID NOT NULL REFERENCES sessoes_avaliacao(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  metadata    JSONB,              -- [META] parsed (evidencias, confianca, proximo_passo)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msgs_sessao ON mensagens_chat(sessao_id, created_at);

-- Triggers
CREATE TRIGGER set_sessoes_aval_updated_at
  BEFORE UPDATE ON sessoes_avaliacao
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE sessoes_avaliacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagens_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessoes_aval_tenant ON sessoes_avaliacao
  USING (empresa_id = public.get_empresa_id());

CREATE POLICY msgs_chat_tenant ON mensagens_chat
  USING (sessao_id IN (SELECT id FROM sessoes_avaliacao WHERE empresa_id = public.get_empresa_id()));
