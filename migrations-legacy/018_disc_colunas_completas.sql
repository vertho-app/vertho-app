-- 018: Colunas separadas para liderança, 16 competências e preferências de aprendizagem

-- Liderança
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS lid_executivo NUMERIC,
  ADD COLUMN IF NOT EXISTS lid_motivador NUMERIC,
  ADD COLUMN IF NOT EXISTS lid_metodico NUMERIC,
  ADD COLUMN IF NOT EXISTS lid_sistematico NUMERIC;

-- 16 Competências
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS comp_ousadia NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_comando NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_objetividade NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_assertividade NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_persuasao NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_extroversao NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_entusiasmo NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_sociabilidade NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_empatia NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_paciencia NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_persistencia NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_planejamento NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_organizacao NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_detalhismo NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_prudencia NUMERIC,
  ADD COLUMN IF NOT EXISTS comp_concentracao NUMERIC;

-- Preferências de aprendizagem
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS pref_video_curto INT,
  ADD COLUMN IF NOT EXISTS pref_video_longo INT,
  ADD COLUMN IF NOT EXISTS pref_texto INT,
  ADD COLUMN IF NOT EXISTS pref_audio INT,
  ADD COLUMN IF NOT EXISTS pref_infografico INT,
  ADD COLUMN IF NOT EXISTS pref_exercicio INT,
  ADD COLUMN IF NOT EXISTS pref_mentor INT,
  ADD COLUMN IF NOT EXISTS pref_estudo_caso INT;

-- Timestamp do mapeamento
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS mapeamento_em TIMESTAMPTZ;
