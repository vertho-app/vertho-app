-- 121 — FKs em votacao_competencias
--
-- Contexto: a tabela (migration 053) tem empresa_id e colaborador_id como UUID
-- soltos, SEM REFERENCES. Risco de voto órfão e de voto cross-tenant (nada no
-- banco impede gravar empresa_id de outro tenant). Verificado: 0 órfãos hoje.
--
-- ON DELETE CASCADE: votos seguem o ciclo de vida da empresa/colaborador
-- (mesmo padrão das demais tabelas tenant-owned, ex. academia, pulse_*).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.votacao_competencias'::regclass
      AND conname = 'votacao_competencias_empresa_id_fkey'
  ) THEN
    ALTER TABLE public.votacao_competencias
      ADD CONSTRAINT votacao_competencias_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.votacao_competencias'::regclass
      AND conname = 'votacao_competencias_colaborador_id_fkey'
  ) THEN
    ALTER TABLE public.votacao_competencias
      ADD CONSTRAINT votacao_competencias_colaborador_id_fkey
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE;
  END IF;
END $$;
