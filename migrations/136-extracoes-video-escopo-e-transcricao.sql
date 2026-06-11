-- Refina o tracker de extração:
-- 1) Separa ESCOPO (empresa-alvo do módulo; NULL = global) da ORIGEM (de onde a
--    extração foi disparada — empresa OU Vertho/global). Antes o escopo era
--    derivado da origem (escopo_global), o que não permitia disparar do nível
--    Vertho e mirar uma empresa específica.
-- 2) Prepara o fluxo de vídeos longos (>1h): transcrição completa guardada +
--    múltiplos módulos por vídeo (N módulos por tema).
ALTER TABLE extracoes_video
  ADD COLUMN IF NOT EXISTS escopo_empresa_id uuid REFERENCES empresas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS transcricao text,
  ADD COLUMN IF NOT EXISTS modulo_base_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS n_modulos integer NOT NULL DEFAULT 0;

-- Backfill: linhas antigas tinham escopo derivado de (escopo_global ? null : origem).
UPDATE extracoes_video
  SET escopo_empresa_id = CASE WHEN escopo_global THEN NULL ELSE origem_empresa_id END
  WHERE escopo_empresa_id IS NULL AND escopo_global IS NOT NULL;
