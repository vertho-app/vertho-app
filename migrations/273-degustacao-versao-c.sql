-- 273: degustação versão C (diagnóstico guiado)
--
-- `Medido 03/10/2026`: dos 5 convites B reais, 4 de 4 entraram pela sala do RH
-- (o "Comece por aqui"), os 3 com clique registrado foram na primeira pergunta
-- da lista e 0 de 5 clicaram em "falar com a Vertho". A B mostra o mapa do
-- produto por papel; a C parte da dor do lead: ele escolhe UM desafio, vê a
-- resposta na sala e volta ao início. O perfil comportamental é opcional e
-- sempre o mapeamento completo.
--
-- A única mudança de banco é a CHECK de `experience_version`, que a mig 256
-- limitou a ('A', 'B'). Sem ela o INSERT do passaporte C falha. Nenhuma coluna
-- nova: o desafio escolhido primeiro fica em `relevant_exploration_target`
-- (valores `dor-<chave>`, a coluna é texto livre desde a mig 267) e o clique de
-- contato em `contact_clicked_at`, que já existem.
--
-- Relaxa uma restrição: o código que hoje lê só A e B continua valendo. Aplicar
-- ANTES do deploy do código que grava 'C'.

ALTER TABLE demo_prospect_sessions
  DROP CONSTRAINT IF EXISTS demo_prospect_sessions_experience_version_check;
ALTER TABLE demo_prospect_sessions
  ADD CONSTRAINT demo_prospect_sessions_experience_version_check
  CHECK (experience_version IN ('A', 'B', 'C'));

COMMENT ON COLUMN demo_prospect_sessions.experience_version IS
  'Roteiro enviado ao prospect: A (quatro links, etapa 01 loga direto), B (um link para a página de boas-vindas com as três visões) ou C (um link para o diagnóstico guiado: escolhe um desafio, vê a resposta e volta ao início).';

NOTIFY pgrst, 'reload schema';

-- Rollback manual (só depois de nenhum passaporte C existir, senão a CHECK recusa):
-- ALTER TABLE demo_prospect_sessions DROP CONSTRAINT IF EXISTS demo_prospect_sessions_experience_version_check;
-- ALTER TABLE demo_prospect_sessions ADD CONSTRAINT demo_prospect_sessions_experience_version_check
--   CHECK (experience_version IN ('A', 'B'));
-- NOTIFY pgrst, 'reload schema';
