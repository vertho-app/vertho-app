-- Kit Semanal (Fase 1 — a espinha). Ver docs/KIT-SEMANAL.md.
-- Grão: (competência × descritor × DISC). 1 brief (núcleo DISC-neutro) → 4 kits
-- (um por DISC, cada um com SEU desafio) → 16 micro_conteudos (4 formatos × 4 DISC).

-- BRIEF: a espinha conceitual compartilhada por (competência × descritor × nível).
CREATE TABLE IF NOT EXISTS kit_briefs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,  -- NULL = global
  competencia   text NOT NULL,
  descritor     text NOT NULL,
  nivel_min     numeric NOT NULL DEFAULT 1.0,
  nivel_max     numeric NOT NULL DEFAULT 2.0,
  cargo         text NOT NULL DEFAULT 'todos',
  contexto      text NOT NULL DEFAULT 'generico',
  modulo_base_id uuid,                       -- de onde o núcleo saiu (rastreio)
  brief         jsonb NOT NULL,              -- { ideia_central, pontos_chave[], exemplo_ancora }
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  versao        int  NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);

-- Resolução de brief existente por tema (idempotência da geração).
CREATE INDEX IF NOT EXISTS idx_kit_briefs_tema
  ON kit_briefs (competencia, descritor, nivel_min, nivel_max, cargo, contexto, empresa_id);

-- KITS: 4 por brief, um por DISC, cada um com o desafio próprio do perfil.
CREATE TABLE IF NOT EXISTS kits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id      uuid NOT NULL REFERENCES kit_briefs(id) ON DELETE CASCADE,
  disc          text NOT NULL CHECK (disc IN ('D', 'I', 'S', 'C')),
  desafio       jsonb NOT NULL,              -- DesafioStructured (próprio do DISC)
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'generating', 'published', 'error')),
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz,
  UNIQUE (brief_id, disc)                     -- 1 kit por (brief, DISC)
);

CREATE INDEX IF NOT EXISTS idx_kits_brief ON kits (brief_id);

-- Vínculo dos 4 formatos ao kit + denormalização do DISC p/ filtro rápido na entrega.
ALTER TABLE micro_conteudos
  ADD COLUMN IF NOT EXISTS kit_id uuid REFERENCES kits(id) ON DELETE SET NULL;
ALTER TABLE micro_conteudos
  ADD COLUMN IF NOT EXISTS disc text;         -- 'D'|'I'|'S'|'C' quando vem de um kit

CREATE INDEX IF NOT EXISTS idx_micro_conteudos_kit ON micro_conteudos (kit_id);
