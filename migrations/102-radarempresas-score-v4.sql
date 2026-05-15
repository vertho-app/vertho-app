-- ─────────────────────────────────────────────────────────────────────────
-- 102 — Radar Empresas: colunas do score v4
--
-- v4 separa o que estava misturado:
--   - score_confidence: confiança do score (CNAE mapeado + robustez
--     CAGED/RAIS). Evita over-confidence em setor minúsculo/genérico.
--   - commercial_actionability: facilidade de abordar (email/tel/fantasia/
--     matriz). NÃO entra no score_total — é filtro/desempate.
--   - priority_rank: percentil do score entre os ELEGÍVEIS na cidade
--     (0-100, 100=topo). "Abordar agora operacional" = priority_rank alto.
--   - low_team_probability: renomeia o antigo proxy_mei (micro sem equipe
--     provável). Boolean derivado, auditável.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE radarempresas_scores
  ADD COLUMN IF NOT EXISTS score_confidence        TEXT,     -- alta|media|baixa
  ADD COLUMN IF NOT EXISTS commercial_actionability NUMERIC, -- 0-100
  ADD COLUMN IF NOT EXISTS priority_rank           NUMERIC,  -- percentil 0-100
  ADD COLUMN IF NOT EXISTS low_team_probability    BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_radaremp_scores_priority
  ON radarempresas_scores (priority_rank DESC);
CREATE INDEX IF NOT EXISTS idx_radaremp_scores_confidence
  ON radarempresas_scores (score_confidence);

SELECT 'radarempresas_scores' AS tabela,
       COUNT(*) AS linhas,
       COUNT(score_confidence) AS com_confidence
FROM radarempresas_scores;
