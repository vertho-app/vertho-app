-- Mantém a versão do formulário por assignment para não alterar pulsos
-- já abertos e armazena respostas/resultado DISC do contexto de trabalho
-- exclusivamente dentro do domínio do pulso.

ALTER TABLE pulse_assignments
  ADD COLUMN IF NOT EXISTS template_version TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS contextual_disc JSONB;

ALTER TABLE pulse_responses
  ADD COLUMN IF NOT EXISTS answer_json JSONB;

COMMENT ON COLUMN pulse_assignments.template_version IS
  'Versão imutável do template atribuída no disparo do pulso.';
COMMENT ON COLUMN pulse_assignments.contextual_disc IS
  'Resultado DISC contextual calculado das perguntas do pulso; não altera o perfil comportamental.';
COMMENT ON COLUMN pulse_responses.answer_json IS
  'Resposta estruturada para ranking e escolha forçada do bloco contextual.';

NOTIFY pgrst, 'reload schema';
