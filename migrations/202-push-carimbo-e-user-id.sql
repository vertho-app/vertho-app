-- 202 — push como TERCEIRO canal da pílula + limpeza de coluna órfã.
--
-- (a) Carimbo por canal para o push.
--
-- WhatsApp e e-mail já leem idempotência de colunas da própria linha de
-- `fase4_envios`, que o cron JÁ carregou — zero query extra. Resolver a
-- idempotência do push por `notification_deliveries.dedupe_key` exigiria um
-- SELECT por pessoa por dia E, pior, faria o push ser o único canal com
-- mecanismo diferente dos irmãos. Nesta base, "dois caminhos para a mesma
-- coisa" já custou três correções no gêmeo errado em um único dia.
--
-- O carimbo por canal existe porque carimbar incondicionalmente mentia: numa
-- queda do provedor o banco afirmava "pílula enviada" sem nada ter saído, e o
-- carimbo então BLOQUEAVA o reenvio (F-C4). Push segue a mesma regra: só carimba
-- o próprio sucesso.
--
-- (b) `notification_endpoints.user_id` era coluna órfã — nenhuma rota preenchia.
-- Dropada em vez de preenchida: `colaborador_id` é a identidade que esta base
-- usa, e ela é ESCOPADA POR TENANT (a mesma pessoa em 5 empresas são 5
-- colaboradores). Um `user_id` apontando para `auth.users` seria uma segunda
-- identidade para a mesma coisa, e quem consultasse por ela cruzaria tenants sem
-- perceber. Coluna vazia é dívida; coluna com identidade cross-tenant é furo.

ALTER TABLE fase4_envios
  ADD COLUMN IF NOT EXISTS ultima_pilula1_push_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_pilula2_push_em timestamptz;

COMMENT ON COLUMN fase4_envios.ultima_pilula1_push_em IS
  'Carimbo do canal PUSH da pílula 1. Só é gravado após entrega confirmada — canal não confirmado segue pendente e recuperável, igual a whatsapp/email.';
COMMENT ON COLUMN fase4_envios.ultima_pilula2_push_em IS
  'Carimbo do canal PUSH da pílula 2. Ver ultima_pilula1_push_em.';

ALTER TABLE notification_endpoints DROP COLUMN IF EXISTS user_id;

-- Rollback (se precisar):
-- ALTER TABLE fase4_envios DROP COLUMN IF EXISTS ultima_pilula1_push_em;
-- ALTER TABLE fase4_envios DROP COLUMN IF EXISTS ultima_pilula2_push_em;
-- ALTER TABLE notification_endpoints ADD COLUMN IF NOT EXISTS user_id uuid;
