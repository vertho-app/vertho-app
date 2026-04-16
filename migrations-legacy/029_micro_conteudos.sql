-- Banco unificado de micro-conteúdos para o Motor de Temporadas.
-- Substitui a lógica antiga do Moodle. Conteúdo pode ser:
--   - vídeo (Bunny Stream)
--   - áudio (podcast/narração — Supabase Storage)
--   - texto (artigo markdown — inline ou Storage)
--   - case (estudo de caso narrativo — inline ou Storage)
--   - pdf (material complementar)

CREATE TABLE IF NOT EXISTS micro_conteudos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Multi-tenant: NULL = conteúdo global (disponível para todas as empresas)
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,

  -- Identificação
  titulo TEXT NOT NULL,
  descricao TEXT,
  formato TEXT NOT NULL CHECK (formato IN ('video','audio','texto','case','pdf')),
  duracao_min NUMERIC,

  -- Localização do conteúdo
  url TEXT,                             -- URL pública (Bunny embed, Storage signed URL, etc.)
  storage_path TEXT,                    -- caminho no Supabase Storage (se aplicável)
  bunny_video_id TEXT,                  -- GUID do Bunny Stream (para formato='video')
  conteudo_inline TEXT,                 -- markdown inline para texto/case curto

  -- Tags obrigatórias (motor de busca)
  competencia TEXT NOT NULL,
  descritor TEXT,                       -- pode ser NULL para conteúdos genéricos da competência
  nivel_min NUMERIC DEFAULT 1.0,
  nivel_max NUMERIC DEFAULT 4.0,
  tipo_conteudo TEXT DEFAULT 'core' CHECK (tipo_conteudo IN ('core','complementar')),

  -- Tags de contexto
  contexto TEXT DEFAULT 'generico',     -- educacional | corporativo | generico
  cargo TEXT DEFAULT 'todos',           -- ex: "Diretor Escolar" | "todos"
  setor TEXT DEFAULT 'todos',           -- educacao_publica | agro | saude | todos

  -- Tags de produção
  apresentador TEXT,                    -- socio_a | socio_b | generico | NULL
  origem TEXT DEFAULT 'pre_produzido'   -- pre_produzido | ia_gerado | ia_heygen_clone | ia_podcast
    CHECK (origem IN ('pre_produzido','ia_gerado','ia_heygen_clone','ia_podcast')),
  versao INT DEFAULT 1,
  ativo BOOLEAN DEFAULT true,

  -- Métricas (calculadas pelo motor de analytics)
  taxa_conclusao NUMERIC,               -- 0-100, % de quem assistiu/leu até o fim
  total_views INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices de busca
CREATE INDEX IF NOT EXISTS idx_mc_competencia ON micro_conteudos(competencia, descritor);
CREATE INDEX IF NOT EXISTS idx_mc_nivel ON micro_conteudos(nivel_min, nivel_max);
CREATE INDEX IF NOT EXISTS idx_mc_formato ON micro_conteudos(formato);
CREATE INDEX IF NOT EXISTS idx_mc_contexto ON micro_conteudos(contexto, cargo, setor);
CREATE INDEX IF NOT EXISTS idx_mc_empresa ON micro_conteudos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_mc_ativo ON micro_conteudos(ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_mc_bunny ON micro_conteudos(bunny_video_id) WHERE bunny_video_id IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trg_mc_updated() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mc_updated_at ON micro_conteudos;
CREATE TRIGGER trg_mc_updated_at BEFORE UPDATE ON micro_conteudos
  FOR EACH ROW EXECUTE FUNCTION trg_mc_updated();

-- RLS
ALTER TABLE micro_conteudos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mc_service_all ON micro_conteudos;
CREATE POLICY mc_service_all ON micro_conteudos FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS mc_authenticated_read ON micro_conteudos;
CREATE POLICY mc_authenticated_read ON micro_conteudos FOR SELECT TO authenticated USING (ativo = true);

COMMENT ON TABLE micro_conteudos IS 'Banco unificado de micro-conteúdos (vídeo Bunny, áudio, texto, case) para o Motor de Temporadas. Substitui o catálogo do Moodle.';
