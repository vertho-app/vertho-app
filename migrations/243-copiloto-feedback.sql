-- Copiloto PACE: o que o vendedor achou da conversa e das sugestões.
--
-- Sem isto o módulo gera valor e não mede nada: não há como saber se a sugestão
-- ajudou, nem se a reunião alcançou o objetivo que o Play definiu. Duas colunas
-- na própria conversa, e não tabela nova, porque o feedback é sobre AQUELA
-- reunião e chega junto do resultado — separá-lo criaria uma órfã por reunião
-- não salva.
--
-- goal_reached: 'sim' | 'parcial' | 'nao'. NULL = o vendedor não respondeu, que
-- é diferente de "não alcançou" e precisa continuar distinguível.
--
-- suggestion_feedback: [{ text, useful, phase, at }] — os polegares dados
-- durante o ao vivo, acumulados na tela e enviados no salvamento.

ALTER TABLE copilot_conversations
  ADD COLUMN IF NOT EXISTS goal_reached text
    CHECK (goal_reached IS NULL OR goal_reached IN ('sim', 'parcial', 'nao'));

ALTER TABLE copilot_conversations
  ADD COLUMN IF NOT EXISTS suggestion_feedback jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN copilot_conversations.goal_reached IS
  'O objetivo da hora foi alcançado? sim/parcial/nao. NULL = não respondido.';
COMMENT ON COLUMN copilot_conversations.suggestion_feedback IS
  'Polegares dados às sugestões durante o ao vivo: [{text, useful, phase, at}].';

-- Só as respondidas entram no índice: a pergunta "quantas reuniões atingiram o
-- objetivo" varre um subconjunto pequeno, e o índice parcial não paga por linha
-- que nunca será consultada.
CREATE INDEX IF NOT EXISTS copilot_conversations_goal_reached_idx
  ON copilot_conversations (representante_id, goal_reached, happened_at DESC)
  WHERE goal_reached IS NOT NULL;
