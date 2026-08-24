-- B5 da auditoria 22/08 — idempotência do turno do chat de assessment.
--
-- O problema que ela resolve: `/api/chat` faz IA + 4 escritas por turno. Se a
-- última falha (ou a lambda morre depois de responder à IA), o retry chama a IA
-- de novo e insere um SEGUNDO turno do usuário. Turno duplicado não é só lixo:
-- `totalTurnos` é derivado de `mensagens_chat` e alimenta `decidirFase` e
-- `deveEncerrar` contra MAX_TURNOS = 10 — duplicar ENCURTA a conversa, e quem
-- fecha a semana é a conversa.
--
-- `client_turn_id` é gerado pelo CLIENTE e mantido estável enquanto a mensagem
-- não confirma; o servidor trata `23505` neste índice como "já gravei este
-- turno", não como erro.
--
-- ⚠️ Índice PARCIAL de propósito (`WHERE client_turn_id IS NOT NULL`): as
-- mensagens antigas e as do assistente não têm a chave, e um índice total as
-- colapsaria numa linha só por sessão. O preço do parcial é que ele NÃO serve
-- para `onConflict` do PostgREST (que não expressa predicado — dá 42P10, como
-- em 07/08). Aqui isso não é limitação: a rota usa INSERT e lê o código do erro,
-- nunca upsert.
--
-- Idempotente: pode rodar de novo sem efeito.

ALTER TABLE mensagens_chat
  ADD COLUMN IF NOT EXISTS client_turn_id text;

COMMENT ON COLUMN mensagens_chat.client_turn_id IS
  'Chave de idempotência do turno, gerada pelo cliente (B5, 24/08/2026). Estável entre retries da MESMA mensagem; NULL nas linhas anteriores à mig 222 e nas mensagens do assistente.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_mensagens_chat_turno_cliente
  ON mensagens_chat (sessao_id, client_turn_id)
  WHERE client_turn_id IS NOT NULL;
