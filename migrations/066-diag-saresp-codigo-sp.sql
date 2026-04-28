-- ═════════════════════════════════════════════════════════════════
-- Migration 066 — SARESP por código SP (não INEP)
-- O CSV oficial da Seduc-SP usa CODESC (código SP estadual). A correlação
-- com INEP exige tabela DE-PARA — adiamos pra V1.5. Schema agora aceita
-- codigo_sp como chave principal e codigo_inep nullable.
-- ═════════════════════════════════════════════════════════════════

-- Drop PK antiga e dependências (constraints + columns dependentes)
ALTER TABLE diag_saresp_snapshots DROP CONSTRAINT IF EXISTS diag_saresp_snapshots_pkey;

ALTER TABLE diag_saresp_snapshots
  ALTER COLUMN codigo_inep DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS codigo_sp     TEXT,
  ADD COLUMN IF NOT EXISTS rede          TEXT,
  ADD COLUMN IF NOT EXISTS turno         TEXT,
  ADD COLUMN IF NOT EXISTS escola_nome   TEXT,
  ADD COLUMN IF NOT EXISTS dep_administrativa TEXT;

-- Backfill codigo_sp pra linhas existentes (se houver) — usa codigo_inep como fallback
UPDATE diag_saresp_snapshots SET codigo_sp = codigo_inep WHERE codigo_sp IS NULL;

-- Nova PK (composta)
ALTER TABLE diag_saresp_snapshots
  ALTER COLUMN codigo_sp SET NOT NULL,
  ADD CONSTRAINT diag_saresp_snapshots_pkey PRIMARY KEY (codigo_sp, ano, serie, disciplina);

CREATE INDEX IF NOT EXISTS idx_diag_saresp_codigo_sp ON diag_saresp_snapshots(codigo_sp);
CREATE INDEX IF NOT EXISTS idx_diag_saresp_inep      ON diag_saresp_snapshots(codigo_inep);
