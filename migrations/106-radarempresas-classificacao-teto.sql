-- ─────────────────────────────────────────────────────────────────────────
-- 106 — Radar Empresas: teto de classificação por segmento (override)
--
-- Permite rebaixar um segmento inteiro por decisão comercial sem
-- recalibrar pesos (reversível: basta NULL no campo). O caller capeia
-- o score_total ao teto da faixa e reclassifica; registra no
-- score_explanation que houve cap comercial (auditável).
--
-- classificacao_teto: NULL = sem teto · 'boa' = cap 79 · 'nutrir' = cap
-- 59 · 'baixa' = cap 39. Empresa abaixo do teto NÃO sobe (teto, não piso).
--
-- Decisão atual: varejo_especializado → 'nutrir' (fora da prospecção
-- ativa neste momento; reversível quando o foco comercial mudar).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE radarempresas_segmentos
  ADD COLUMN IF NOT EXISTS classificacao_teto TEXT;

UPDATE radarempresas_segmentos
  SET classificacao_teto = 'nutrir'
  WHERE key = 'varejo_especializado';

SELECT key, nome, priority_level, classificacao_teto
FROM radarempresas_segmentos
ORDER BY classificacao_teto NULLS LAST, priority_level;
