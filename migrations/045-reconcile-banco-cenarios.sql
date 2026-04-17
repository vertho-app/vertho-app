-- 045: Reconciliação — banco_cenarios
--
-- O banco de produção tem colunas extras não rastreadas nas migrations, e
-- a migration 033 (p1..p4) NÃO foi aplicada em produção.
--
-- Esta migration reconcilia:
-- 1. Colunas existentes em prod mas ausentes nas migrations (colaborador_id, updated_at)
-- 2. Colunas da migration 033 que não chegaram a ser aplicadas (p1..p4)
--
-- Fonte de verdade: information_schema.columns em produção (2026-04-16).

-- Coluna existente em prod, ausente na migration 026
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL;
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Colunas p1-p4 (perguntas individuais do cenário B)
-- Migration 033 existia mas não foi aplicada em produção.
-- O código em assessment/route.ts e fase5.ts seleciona essas colunas.
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS p1 TEXT;
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS p2 TEXT;
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS p3 TEXT;
ALTER TABLE banco_cenarios ADD COLUMN IF NOT EXISTS p4 TEXT;

-- Nota: existe índice duplicado em produção:
--   idx_banco_cenarios_empresa (empresa_id) — criado manualmente
--   idx_cenarios_empresa (empresa_id) — criado pela migration 026
-- São equivalentes. Não removemos pra não quebrar dependência, mas
-- futuramente um dos dois pode ser dropado.

-- Nota: banco_cenarios.competencia_id não tem FK em produção (apesar
-- de migration 026 definir REFERENCES competencias(id)). Provavelmente
-- removida por conflito com rows legados. Não recriamos.
