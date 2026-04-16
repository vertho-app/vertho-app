-- 022: Suporte ao Relatório Comportamental Individual de 5 páginas
--
-- Adiciona:
-- 1) Cache do relatório (textos do LLM + timestamp)
-- 2) 16 competências adaptadas (já temos as naturais em comp_*)
-- 3) Índices comportamentais (positividade, estima, flexibilidade)
-- 4) Tipo psicológico em formato numérico (0-100) + sigla
--
-- Tudo IF NOT EXISTS, seguro de re-rodar.

-- ── Cache LLM ───────────────────────────────────────────────────────────────
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS report_texts JSONB,
  ADD COLUMN IF NOT EXISTS report_generated_at TIMESTAMPTZ;

-- ── 16 Competências adaptadas ───────────────────────────────────────────────
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS comp_ousadia_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_comando_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_objetividade_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_assertividade_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_persuasao_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_extroversao_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_entusiasmo_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_sociabilidade_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_empatia_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_paciencia_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_persistencia_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_planejamento_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_organizacao_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_detalhismo_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_prudencia_adapt NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_concentracao_adapt NUMERIC;

-- ── Índices comportamentais (0..1) ──────────────────────────────────────────
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS positividade NUMERIC,
  ADD COLUMN IF NOT EXISTS estima NUMERIC,
  ADD COLUMN IF NOT EXISTS flexibilidade NUMERIC;

-- ── Tipo psicológico (numérico 0..100 + sigla 3 letras) ─────────────────────
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS tipo_psicologico TEXT,        -- ex: "ENT", "ISF"
  ADD COLUMN IF NOT EXISTS extroversao NUMERIC,          -- 0..100 (introversão = 100 - extroversao)
  ADD COLUMN IF NOT EXISTS intuicao NUMERIC,             -- 0..100 (sensação = 100 - intuicao)
  ADD COLUMN IF NOT EXISTS pensamento NUMERIC;           -- 0..100 (sentimento = 100 - pensamento)
