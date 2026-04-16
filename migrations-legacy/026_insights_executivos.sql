-- 026: Insights executivos do perfil comportamental
--
-- Cache dos 3 bullets de "Actionable Insights" que aparecem no resumo
-- executivo do perfil comportamental. Gerados via LLM (callAI) ao primeiro
-- acesso ou quando o colab refaz o mapeamento.

ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS insights_executivos JSONB,
  ADD COLUMN IF NOT EXISTS insights_executivos_at TIMESTAMPTZ;
