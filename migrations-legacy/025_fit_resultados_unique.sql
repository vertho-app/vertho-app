-- 025: Constraint UNIQUE em fit_resultados(empresa_id, colaborador_id)
--
-- A migration original criou a tabela sem unique constraint, mas
-- actions/fit-v2.js faz upsert com onConflict: 'empresa_id,colaborador_id'.
-- Sem a constraint o Postgres retorna:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Passos:
-- 1) Remove duplicatas (mantém o registro com updated_at mais recente por par).
-- 2) Cria a constraint UNIQUE.

-- ── 1. Desduplicar ──────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY empresa_id, colaborador_id
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM fit_resultados
)
DELETE FROM fit_resultados
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ── 2. Criar a constraint ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fit_resultados_empresa_colab_uniq'
  ) THEN
    ALTER TABLE fit_resultados
      ADD CONSTRAINT fit_resultados_empresa_colab_uniq
      UNIQUE (empresa_id, colaborador_id);
  END IF;
END $$;
