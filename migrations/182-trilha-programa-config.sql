-- 182: snapshot da ProgramaConfig na trilha (modo Personalizado / builder de degustação)
--
-- O modo 'custom' (builder em Configurações → Programa) gera a config por DADO
-- (empresas.sys_config.programa_custom = inputs {semanas, numCompetencias,
-- fechamento}), não por constante de código. Pra preservar a invariante do
-- carimbo ("a geração congela as regras da trilha" — mig 154), a geração grava
-- aqui o SNAPSHOT COMPLETO da config derivada; o runtime (resolverConfigDaTrilha)
-- lê o snapshot com precedência máxima. Editar o builder depois NÃO afeta
-- trilha em andamento.
--
-- Modos preset (regular_duo/single/onboarding/piloto) seguem SEM snapshot
-- (coluna null) — a config deles resolve pela constante de código, o que mantém
-- o contrato "ligar flag no código vale pra todas as trilhas do modo".
-- Idempotente.

ALTER TABLE trilhas ADD COLUMN IF NOT EXISTS programa_config JSONB DEFAULT NULL;

COMMENT ON COLUMN trilhas.programa_config IS
  'Snapshot da ProgramaConfig derivada na GERAÇÃO (só modo custom; presets=null). Runtime lê daqui com precedência sobre o label programa_modo. Congela as regras da trilha contra edições posteriores do builder.';

COMMENT ON COLUMN trilhas.programa_modo IS
  'Carimbo do modo resolvido na geração: regular_duo | regular_single | onboarding | piloto | custom (mig 182). Sem CHECK proposital — validação em código (resolverModoColab).';

NOTIFY pgrst, 'reload schema';
