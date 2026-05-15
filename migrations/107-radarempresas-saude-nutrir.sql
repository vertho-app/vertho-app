-- ─────────────────────────────────────────────────────────────────────────
-- 107 — Radar Empresas: saúde/clínicas → teto 'nutrir'
--
-- Mesma regra de varejo_especializado (migration 106): decisão
-- comercial de tirar saúde/clínicas da prospecção ativa neste momento.
-- Reversível: UPDATE ... SET classificacao_teto = NULL + re-scorear
-- (o score real fica preservado em score_explanation.teto_comercial).
-- ─────────────────────────────────────────────────────────────────────────

UPDATE radarempresas_segmentos
  SET classificacao_teto = 'nutrir'
  WHERE key = 'saude_clinicas';

SELECT key, nome, classificacao_teto
FROM radarempresas_segmentos
WHERE classificacao_teto IS NOT NULL;
