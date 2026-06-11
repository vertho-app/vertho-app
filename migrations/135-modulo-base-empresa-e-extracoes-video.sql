-- Extração de vídeo → Módulo-Base de Conteúdo (matéria-prima), não micro_conteudo.
-- O alcance é escolhido por extração: GLOBAL (canônico, todos os tenants) ou
-- EXCLUSIVO de uma empresa.

-- 1) Alcance no módulo-base: empresa_id NULL = global/canônico (comportamento
--    atual); preenchido = módulo privado daquele tenant. O engine resolve
--    "global OR do-tenant", preferindo o do tenant.
ALTER TABLE modulos_base_conteudo
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES empresas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_modulos_base_empresa
  ON modulos_base_conteudo (empresa_id);

-- 2) Rastreador da extração assíncrona (Vimeo/TED/LMS/longos via worker
--    trigger.dev). Substitui o uso de micro_conteudos como placeholder. A linha
--    nasce 'processing'; o worker extrai o texto-base e a rota interna estrutura
--    o módulo-base rascunho e grava modulo_base_id + 'done' (ou 'error').
CREATE TABLE IF NOT EXISTS extracoes_video (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_empresa_id uuid REFERENCES empresas(id) ON DELETE CASCADE, -- de onde foi disparada (para listar na tela da empresa)
  escopo_global boolean NOT NULL DEFAULT false,                     -- true = módulo global; false = exclusivo da origem_empresa_id
  url text NOT NULL,
  titulo text,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'done', 'error')),
  error text,
  modulo_base_id uuid REFERENCES modulos_base_conteudo(id) ON DELETE SET NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extracoes_video_origem
  ON extracoes_video (origem_empresa_id, created_at DESC);

-- Admin-only: RLS habilitada sem policy pública (service-role do app ignora RLS).
ALTER TABLE extracoes_video ENABLE ROW LEVEL SECURITY;
