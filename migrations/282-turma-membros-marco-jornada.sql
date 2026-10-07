-- 282: marco de jornada da PARTICIPAÇÃO (07/10/2026).
--
-- Reentrada com jornada nova (a pessoa já fez uma jornada e abre outra, com outra
-- competência) precisa que a turma nova NASÇA ZERADA e que a antiga guarde o
-- histórico e os números dela. Respostas, blueprint e PDI não carregam turma nem
-- temporada, então a conta do painel por pessoa ("tem alguma resposta na
-- empresa?") herdava tudo da jornada anterior.
--
-- `marco_jornada` é o instante em que a participação ABRIU uma jornada nova.
-- NULL = a participação continua a jornada que a pessoa já vinha fazendo (caso de
-- toda participação criada até aqui, e do desmembramento de uma turma em duas):
-- o painel segue contando como antes. Só uma participação com marco corta o
-- histórico (lib/turmas/janela.ts).
--
-- Aditiva e idempotente: NULL preserva o comportamento atual de todo tenant.

ALTER TABLE turma_membros
  ADD COLUMN IF NOT EXISTS marco_jornada timestamptz;

COMMENT ON COLUMN turma_membros.marco_jornada IS
  'Instante em que a participação ABRIU uma jornada nova (mig 282). NULL = continua a jornada anterior da pessoa. Define a janela [marco, marco da próxima participação com marco) em que respostas, IA4, PDI e trilhas contam para esta turma.';
