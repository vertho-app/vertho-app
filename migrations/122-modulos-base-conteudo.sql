-- Módulos-Base de Conteúdo (frente 2 de 3).
-- Fonte canônica por (competência × transição de nível) que a IA consome como
-- matéria-prima pedagógica pra gerar texto/podcast/vídeo personalizados.
-- Spec: docs/MODULOS-BASE-CONTEUDO.md.
--
-- Platform-level (sem empresa_id) — todos os tenants veem os mesmos módulos.
-- O "descritor" e os textos da régua N1-N4 ficam embedded em competencias_base
-- (cols descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia),
-- então o módulo aponta SÓ pra competencia_base — não há tabela de descritores.

-- ── ENUMs ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE modulo_base_nivel  AS ENUM ('N1', 'N2', 'N3', 'N4');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE modulo_base_status AS ENUM ('rascunho', 'revisao', 'publicado', 'obsoleto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE modulo_base_locale AS ENUM ('pt-BR', 'pt-PT', 'es-ES', 'en-US');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tabela ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.modulos_base_conteudo (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id               UUID NOT NULL DEFAULT gen_random_uuid(),
  locale                 modulo_base_locale NOT NULL DEFAULT 'pt-BR',
  competencia_base_id    UUID NOT NULL REFERENCES public.competencias_base(id) ON DELETE RESTRICT,
  nivel_entrada          modulo_base_nivel NOT NULL,
  nivel_destino          modulo_base_nivel NOT NULL,
  titulo                 TEXT NOT NULL CHECK (length(titulo) <= 120),
  finalidade             TEXT NOT NULL CHECK (length(finalidade) <= 400),
  contexto_pedagogico    TEXT CHECK (contexto_pedagogico IS NULL OR length(contexto_pedagogico) <= 80),
  tags                   TEXT[] NOT NULL DEFAULT '{}',
  preferido              BOOLEAN NOT NULL DEFAULT FALSE,
  status                 modulo_base_status NOT NULL DEFAULT 'rascunho',
  versao                 INTEGER NOT NULL DEFAULT 1,
  substitui_modulo_id    UUID REFERENCES public.modulos_base_conteudo(id) ON DELETE SET NULL,

  -- Corpo do módulo (1 JSONB por bloco — facilita update parcial + analytics)
  conteudo_central       JSONB NOT NULL DEFAULT '{}'::jsonb,
  conteudo_aplicavel     JSONB NOT NULL DEFAULT '{}'::jsonb,
  guarda_corpos          JSONB NOT NULL DEFAULT '{}'::jsonb,
  adaptacao_por_formato  JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Auditoria
  created_by             TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by            TEXT,
  reviewed_at            TIMESTAMPTZ,
  published_by           TEXT,
  published_at           TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT modulo_base_nivel_destino_maior CHECK (nivel_destino > nivel_entrada),
  CONSTRAINT modulo_base_grupo_locale_uniq   UNIQUE (grupo_id, locale)
);

-- Apenas 1 variante `preferido = true` por grupo
CREATE UNIQUE INDEX IF NOT EXISTS modulo_base_grupo_preferido_uniq
  ON public.modulos_base_conteudo (grupo_id)
  WHERE preferido = TRUE;

-- Resolução do engine (filtrar publicados por competência+níveis)
CREATE INDEX IF NOT EXISTS modulo_base_compbase_nivel_publicado
  ON public.modulos_base_conteudo (competencia_base_id, nivel_entrada, nivel_destino)
  WHERE status = 'publicado';

CREATE INDEX IF NOT EXISTS modulo_base_status_idx ON public.modulos_base_conteudo (status);
CREATE INDEX IF NOT EXISTS modulo_base_tags_gin   ON public.modulos_base_conteudo USING GIN (tags);
CREATE INDEX IF NOT EXISTS modulo_base_grupo_idx  ON public.modulos_base_conteudo (grupo_id);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.trg_modulos_base_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS modulos_base_set_updated_at ON public.modulos_base_conteudo;
CREATE TRIGGER modulos_base_set_updated_at
  BEFORE UPDATE ON public.modulos_base_conteudo
  FOR EACH ROW EXECUTE FUNCTION public.trg_modulos_base_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Leitura aberta a usuários autenticados (módulos são públicos pra plataforma).
-- Escrita só via service-role (admin Vertho ações no servidor).
ALTER TABLE public.modulos_base_conteudo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "modulos_base_read_authenticated" ON public.modulos_base_conteudo;
CREATE POLICY "modulos_base_read_authenticated"
  ON public.modulos_base_conteudo
  FOR SELECT TO authenticated USING (TRUE);
