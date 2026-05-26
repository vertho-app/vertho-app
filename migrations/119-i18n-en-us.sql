-- Add English (US) to supported application locales.

ALTER TABLE empresas
  DROP CONSTRAINT IF EXISTS empresas_default_locale_check;

ALTER TABLE empresas
  ADD CONSTRAINT empresas_default_locale_check
  CHECK (default_locale IN ('pt-BR', 'pt-PT', 'es-ES', 'en-US'));

ALTER TABLE colaboradores
  DROP CONSTRAINT IF EXISTS colaboradores_locale_check;

ALTER TABLE colaboradores
  ADD CONSTRAINT colaboradores_locale_check
  CHECK (locale IS NULL OR locale IN ('pt-BR', 'pt-PT', 'es-ES', 'en-US'));

COMMENT ON COLUMN empresas.default_locale IS 'Idioma padrão da empresa: pt-BR, pt-PT, es-ES, en-US.';
COMMENT ON COLUMN colaboradores.locale IS 'Preferência individual de idioma: pt-BR, pt-PT, es-ES, en-US.';
