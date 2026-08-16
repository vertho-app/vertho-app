-- 219 — O índice único do push de admin não pode ser PARCIAL.
--
-- 🔴 O BUG (medido em 16/08/2026, com o botão de ativar push já no ar)
-- ────────────────────────────────────────────────────────────────────
-- Ativar o push da inbox devolvia 500 com "não foi possível registrar a
-- inscrição". A causa, no log:
--
--   [admin/push] upsert falhou: there is no unique or exclusion constraint
--   matching the ON CONFLICT specification
--
-- A mig 218 criou o índice de admin como PARCIAL:
--
--   CREATE UNIQUE INDEX … ON (user_id, installation_id) WHERE user_id IS NOT NULL
--
-- O Postgres só aceita um índice parcial como ÁRBITRO de `ON CONFLICT` quando a
-- própria instrução repete o predicado (`ON CONFLICT (…) WHERE user_id IS NOT
-- NULL`). O PostgREST não tem como expressar isso: o `on_conflict=` aceita só a
-- lista de colunas. Resultado: 42P10, e o upsert nunca funcionou.
--
-- 🔑 O CONTRASTE QUE ENTREGA O DIAGNÓSTICO: o índice do caminho de COLABORADOR,
-- `notification_endpoints_instalacao_uniq (colaborador_id, installation_id)`,
-- **não é parcial** — e por isso aquele push sempre funcionou. O de admin foi
-- escrito "por simetria", com um `WHERE` a mais que parecia mais correto e
-- quebrou o único consumidor.
--
-- POR QUE TIRAR O PREDICADO É SEGURO
-- ──────────────────────────────────
-- Em índice único, o Postgres trata NULLs como DISTINTOS por padrão (NULLS
-- DISTINCT; conferido: server_version 17.0006, e a tabela não usa NULLS NOT
-- DISTINCT). As linhas de colaborador têm `user_id IS NULL`, então elas não
-- colidem entre si no índice novo — exatamente como as linhas de admin, que têm
-- `colaborador_id IS NULL`, já convivem no índice de colaborador desde sempre.
--
-- O CHECK XOR da mig 218 continua garantindo que cada linha tem um dono só.
--
-- Estado ao aplicar: 0 linhas de admin, 5 de colaborador — nada para violar.

DROP INDEX IF EXISTS idx_notif_endpoints_admin_instalacao_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_endpoints_admin_instalacao_uniq
  ON notification_endpoints (user_id, installation_id);

COMMENT ON INDEX idx_notif_endpoints_admin_instalacao_uniq IS
  'Uma instalação por admin (user_id, installation_id). NÃO PODE SER PARCIAL: é o árbitro do ON CONFLICT do upsert em /api/notifications/admin/subscriptions, e o PostgREST não expressa predicado. NULLs são distintos, então as linhas de colaborador (user_id NULL) não colidem.';

-- Rollback (⚠️ volta a quebrar o registro de push do admin):
-- DROP INDEX IF EXISTS idx_notif_endpoints_admin_instalacao_uniq;
-- CREATE UNIQUE INDEX idx_notif_endpoints_admin_instalacao_uniq
--   ON notification_endpoints (user_id, installation_id) WHERE user_id IS NOT NULL;
