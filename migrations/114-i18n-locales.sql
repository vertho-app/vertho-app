-- ─────────────────────────────────────────────────────────────────────────
-- 114 — Preferência de idioma por empresa e colaborador
--
-- Base para internacionalização:
--   - empresas.default_locale define o idioma padrão do tenant.
--   - colaboradores.locale permite preferência individual.
--   - ambos aceitam apenas os locales suportados pela aplicação.
--
-- Fallback em app: colaborador.locale → empresa.default_locale → pt-BR.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS default_locale TEXT NOT NULL DEFAULT 'pt-BR';

ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS locale TEXT;

ALTER TABLE empresas
  DROP CONSTRAINT IF EXISTS empresas_default_locale_check;

ALTER TABLE empresas
  ADD CONSTRAINT empresas_default_locale_check
  CHECK (default_locale IN ('pt-BR', 'pt-PT', 'es-ES'));

ALTER TABLE colaboradores
  DROP CONSTRAINT IF EXISTS colaboradores_locale_check;

ALTER TABLE colaboradores
  ADD CONSTRAINT colaboradores_locale_check
  CHECK (locale IS NULL OR locale IN ('pt-BR', 'pt-PT', 'es-ES'));

CREATE INDEX IF NOT EXISTS idx_empresas_default_locale
  ON empresas(default_locale);

CREATE INDEX IF NOT EXISTS idx_colaboradores_locale
  ON colaboradores(locale)
  WHERE locale IS NOT NULL;

COMMENT ON COLUMN empresas.default_locale IS
'Idioma padrão do tenant Vertho. Locales suportados: pt-BR, pt-PT, es-ES.';

COMMENT ON COLUMN colaboradores.locale IS
'Preferência individual de idioma. Se NULL, usa empresas.default_locale.';

SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'empresas' AND column_name = 'default_locale') AS empresas_tem_default_locale,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'colaboradores' AND column_name = 'locale') AS colaboradores_tem_locale;
