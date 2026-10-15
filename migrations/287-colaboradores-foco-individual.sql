-- 287: competência foco DA PESSOA (15/10/2026, Amazon Bowling).
--
-- Até aqui o foco era só do CARGO (`cargos_empresa.competencias_foco`, mig 174), lido por blueprint,
-- PDI e trilha via `focoDoCargo`. Na Amazon a regra é outra: cada pessoa faz a trilha da competência
-- em que teve a MENOR nota na avaliação, e pessoas do mesmo cargo podem cair em competências
-- diferentes (Supervisão de Loja e Operação tem 4 pessoas).
--
-- `foco_individual` vence o foco do cargo em todos os leitores (`focoDaPessoa`, lib/foco-cargo.ts).
-- Quem grava: a etapa "Competência de cada pessoa" do Fluxo completo, quando a empresa liga
-- `sys_config.foco_individual = 'menor_nota'`. Grava UMA vez (só onde está vazio): a escolha fica
-- congelada para blueprint, PDI e trilha lerem o mesmo valor.

ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS foco_individual TEXT[];
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS foco_individual_meta JSONB;

COMMENT ON COLUMN colaboradores.foco_individual IS
  'Competência(s) foco DA PESSOA; vence cargos_empresa.competencias_foco em blueprint, PDI e trilha (focoDaPessoa). Nulo = usa o foco do cargo.';
COMMENT ON COLUMN colaboradores.foco_individual_meta IS
  'Como o foco individual foi escolhido: regra, médias por competência, critério de desempate, competências empatadas, quando e por quem.';

-- Rollback (se precisar):
-- ALTER TABLE colaboradores DROP COLUMN IF EXISTS foco_individual_meta;
-- ALTER TABLE colaboradores DROP COLUMN IF EXISTS foco_individual;
