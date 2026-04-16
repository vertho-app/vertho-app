-- 020: Tabelas referenciadas no código mas ausentes nas migrations anteriores

-- Relatórios gerados (individual, gestor, RH)
CREATE TABLE IF NOT EXISTS relatorios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('individual', 'gestor', 'rh', 'plenaria', 'evolucao')),
  conteudo      JSONB,
  gerado_em     TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, colaborador_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_relatorios_empresa ON relatorios(empresa_id, tipo);

-- PDIs (Planos de Desenvolvimento Individual)
CREATE TABLE IF NOT EXISTS pdis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  conteudo      JSONB,
  status        TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'concluido', 'cancelado')),
  gerado_em     TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pdis_colab ON pdis(colaborador_id, status);

-- Fase4 Envios (tracking semanal por colaborador)
CREATE TABLE IF NOT EXISTS fase4_envios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id  UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  competencia_id  UUID REFERENCES competencias(id),
  semana_atual    INT DEFAULT 1,
  sequencia       JSONB,
  status          TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'concluido', 'pausado')),
  ultimo_envio    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fase4_envios_colab ON fase4_envios(colaborador_id, status);

-- Trilhas Catálogo (mapeamento conteúdo → competência)
CREATE TABLE IF NOT EXISTS trilhas_catalogo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID REFERENCES empresas(id) ON DELETE CASCADE,
  competencia_id  UUID REFERENCES competencias(id),
  titulo          TEXT,
  url             TEXT,
  tipo            TEXT,
  descricao       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Capacitação: coluna adicional para avaliação de evidência
ALTER TABLE capacitacao
  ADD COLUMN IF NOT EXISTS evidencia_texto TEXT,
  ADD COLUMN IF NOT EXISTS evidencia_avaliacao JSONB;

-- RLS
ALTER TABLE relatorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdis ENABLE ROW LEVEL SECURITY;
ALTER TABLE fase4_envios ENABLE ROW LEVEL SECURITY;
ALTER TABLE trilhas_catalogo ENABLE ROW LEVEL SECURITY;
