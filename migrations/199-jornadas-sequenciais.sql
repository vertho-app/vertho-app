-- 199 — Jornadas sequenciais (05/08/2026)
--
-- O formato novo do programa é a JORNADA de 7 semanas (6 de conteúdo + 1 de
-- avaliação, uma competência). O DUO passa a ser DUAS jornadas em sequência,
-- cada uma com fechamento próprio — logo, duas trilhas para o mesmo
-- colaborador: `numero_temporada` 1 e 2.
--
-- A UNIQUE atual `(empresa_id, colaborador_id)` proíbe isso: ela existe para o
-- upsert atômico do header (F-C1 do FMEA) e presume UMA trilha por pessoa.
-- Passa a incluir `numero_temporada`, que já existe na tabela e já é lido pelo
-- core (regeneração continua batendo na MESMA row, porque o core reusa o
-- número da trilha existente).
--
-- Segurança: a constraint nova é MAIS PERMISSIVA que a antiga — toda linha que
-- passava continua passando. Nenhuma trilha existente é tocada.
-- Idempotente: pode rodar duas vezes.

ALTER TABLE trilhas DROP CONSTRAINT IF EXISTS trilhas_empresa_id_colaborador_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'trilhas'::regclass
      AND conname = 'trilhas_empresa_colab_temporada_key'
  ) THEN
    ALTER TABLE trilhas
      ADD CONSTRAINT trilhas_empresa_colab_temporada_key
      UNIQUE (empresa_id, colaborador_id, numero_temporada);
  END IF;
END $$;

COMMENT ON CONSTRAINT trilhas_empresa_colab_temporada_key ON trilhas IS
  'Uma trilha por (empresa, colaborador, temporada). Jornadas sequenciais: DUO = temporada 1 e 2, cada uma com fechamento próprio (mig 199).';

-- Quem lê "a trilha do colaborador" tem que pegar a de MAIOR numero_temporada.
-- O índice torna esse ORDER BY ... LIMIT 1 barato em qualquer caminho.
CREATE INDEX IF NOT EXISTS idx_trilhas_colab_temporada
  ON trilhas (colaborador_id, numero_temporada DESC);
