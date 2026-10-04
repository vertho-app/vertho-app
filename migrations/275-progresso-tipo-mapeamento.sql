-- 275: a linha de progresso aceita o tipo `mapeamento` (semana 1 do Onboarding)
--
-- A semana 1 do Onboarding de 12 semanas é o Mapeamento que a pessoa já fez
-- antes de a trilha existir (`tipo: 'mapeamento'` no `temporada_plano`, JSONB
-- livre). A linha dela em `temporada_semana_progresso` gravava `avaliacao`
-- porque a CHECK `temporada_semana_progresso_tipo_check` (herdada do baseline)
-- só aceitava `conteudo`, `aplicacao` e `avaliacao`. `avaliacao` é também o
-- tipo da avaliação FINAL, então a linha do mapeamento se passava por ela em
-- qualquer leitura que olhasse a coluna. Decisão do dono (04/10/2026): a linha
-- passa a gravar o tipo certo.
--
-- A única mudança de banco é a CHECK, que ganha `mapeamento`. As outras duas da
-- tabela (`semana` de 1 a 14 e `status`) ficam como estão. Nenhuma coluna nova.
--
-- DROP e ADD na MESMA transação: com o DROP sozinho, a tabela ficaria sem CHECK
-- entre os dois comandos e uma escrita concorrente poderia gravar um tipo que
-- nenhuma versão do código conhece. O ADD revalida as linhas existentes, e todas
-- já cabem (o conjunto novo é um SUPERCONJUNTO do antigo).
--
-- Só AMPLIA o que o banco aceita: o código antigo, que grava `avaliacao` na
-- semana 1, continua valendo. Linhas já gravadas como `avaliacao` na semana 1 do
-- Onboarding não são reescritas aqui (a regeração da trilha as corrige, e toda
-- leitura decide o tipo da semana pelo PLANO). Aplicar ANTES do deploy do código
-- que grava `mapeamento`: sem esta migration a geração do Onboarding falha alto
-- com `violates check constraint`.
--
-- Idempotente: o DROP é IF EXISTS e o ADD recria pelo mesmo nome.

BEGIN;

ALTER TABLE temporada_semana_progresso
  DROP CONSTRAINT IF EXISTS temporada_semana_progresso_tipo_check;
ALTER TABLE temporada_semana_progresso
  ADD CONSTRAINT temporada_semana_progresso_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'conteudo'::text,
    'aplicacao'::text,
    'avaliacao'::text,
    'mapeamento'::text
  ]));

COMMENT ON COLUMN temporada_semana_progresso.tipo IS
  'Tipo da semana, igual ao do slot do temporada_plano: conteudo | aplicacao | avaliacao | mapeamento (mig 275: a semana 1 do Onboarding, que nasce concluída). Quem decide o tipo de uma semana é o PLANO; esta coluna o espelha.';

COMMIT;

-- Rollback manual (só depois de nenhuma linha `mapeamento` existir, senão o ADD recusa):
-- BEGIN;
-- UPDATE temporada_semana_progresso SET tipo = 'avaliacao' WHERE tipo = 'mapeamento';
-- ALTER TABLE temporada_semana_progresso DROP CONSTRAINT IF EXISTS temporada_semana_progresso_tipo_check;
-- ALTER TABLE temporada_semana_progresso ADD CONSTRAINT temporada_semana_progresso_tipo_check
--   CHECK (tipo = ANY (ARRAY['conteudo'::text, 'aplicacao'::text, 'avaliacao'::text]));
-- COMMIT;
