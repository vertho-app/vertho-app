-- 009: Slug para roteamento multi-tenant por subdomínio
-- Cada empresa terá um slug único (ex: "zula") que mapeia para zula.vertho.com.br

-- 1. Adicionar coluna slug
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Popular slugs a partir dos nomes existentes (lowercase, sem acentos, hifenizado)
UPDATE empresas
SET slug = lower(
  regexp_replace(
    translate(
      nome,
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    ),
    '[^a-zA-Z0-9]+', '-', 'g'
  )
)
WHERE slug IS NULL;

-- Remover hífens nas bordas
UPDATE empresas
SET slug = trim(both '-' from slug)
WHERE slug LIKE '-%' OR slug LIKE '%-';

-- 3. Tornar NOT NULL e UNIQUE
ALTER TABLE empresas
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE empresas
  ADD CONSTRAINT empresas_slug_unique UNIQUE (slug);

-- 4. Índice para lookup rápido no middleware
CREATE INDEX IF NOT EXISTS idx_empresas_slug ON empresas(slug);
