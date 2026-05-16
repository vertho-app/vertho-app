-- ─────────────────────────────────────────────────────────────────────────
-- 111 — Radar Empresas BR: TAM somável por cidade (Empresas + Escolas)
--
-- TAM (R$/mês) é unidade comum → somável (≠ score, que não soma). Pra
-- a visão unificada Potencial por Cidade poder somar TAM_empresas +
-- TAM_escolas sem dupla-contagem de escola privada (o tool de Escolas
-- é a fonte autoritativa do vertical educação), o Stage 5 passa a
-- emitir versões *_b2b dos agregados EXCLUINDO educacao_privada:
--
--  - n_priorizados_b2b : priorizados excl. educacao_privada
--  - head_estimado_b2b : Σ headcount estimado (híbrido RAIS→porte) dos
--    priorizados excl. educacao_privada. TAM_empresas = head_estimado
--    _b2b × %escopo × preço/pessoa (knobs configuráveis na tela).
--
-- Colunas existentes (n_priorizados etc.) seguem incluindo educação —
-- o painel Radar Empresas standalone NÃO muda (escola privada é lead
-- B2B válido lá). A exclusão é só na camada de soma unificada.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE radarempresas_cidades_agg
  ADD COLUMN IF NOT EXISTS n_priorizados_b2b INTEGER,
  ADD COLUMN IF NOT EXISTS head_estimado_b2b NUMERIC;

SELECT 'cidades_agg cols' AS t, COUNT(*) AS n FROM radarempresas_cidades_agg;
