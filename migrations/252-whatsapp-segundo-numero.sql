-- 252 — Segundo número na WABA: conversa e telemetria separadas por número.
--
-- POR QUE EXISTE
-- WABA Vertho.ai tem 1 número (+55 11 5236-0168, ID 1256487020887128, TIER_2K).
-- Limite da conta verificada: 250 números. Ligar um 2º é operação normal, mas o
-- schema só conhecia "o número", no singular:
--   - notification_deliveries (mig 198/212) tem provider_message_id mas NENHUMA
--     coluna de número: com 2 números, "quantas saíram por cada um" é impossível;
--   - recebidas.to_phone_id (212) e enviadas.from_phone_id (215) JÁ guardam o
--     número, mas a view whatsapp_conversas (220) agrupa por (empresa, telefone
--     canônico) e JOGA O NÚMERO FORA;
--   - cloud-api.ts lê PHONE_NUMBER_ID global: responder sai sempre pelo número 1,
--     mesmo quando a pessoa escreveu para o 2 — e responder por outro número
--     quebra o fio (docs/INBOX-WHATSAPP.md §3.2).
--
-- COMPATIBILIDADE: tudo aditivo e idempotente. NULL = histórico = número inicial.

-- ── 1) Telemetria por número ────────────────────────────────────────────────
ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS from_phone_id text;

COMMENT ON COLUMN notification_deliveries.from_phone_id IS
  'phone_number_id da Meta que ENVIOU (mig 252). NULL no histórico = número inicial (PHONE_NUMBER_ID). Sem isto, com 2 números o dash não responde "quantas saíram por cada um".';

CREATE INDEX IF NOT EXISTS idx_notif_deliveries_from_phone
  ON notification_deliveries (from_phone_id, sent_at DESC)
  WHERE from_phone_id IS NOT NULL;

-- ── 2) Índices de filtro nas tabelas de conteúdo ────────────────────────────
-- (As colunas já existem desde as migs 212/215; faltava o índice do filtro.)
CREATE INDEX IF NOT EXISTS idx_wa_recebidas_to_phone
  ON whatsapp_mensagens_recebidas (to_phone_id, recebida_em DESC)
  WHERE to_phone_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_enviadas_from_phone
  ON whatsapp_mensagens_enviadas (from_phone_id, enviada_em DESC)
  WHERE from_phone_id IS NOT NULL;

-- ── 3) View com o número ────────────────────────────────────────────────────
-- O AGRUPAMENTO NÃO MUDA: uma linha continua sendo (empresa, telefone canônico).
-- Partir a mesma pessoa em duas conversas lado a lado trocaria um problema de
-- número por um problema de identidade. O que muda: a view EXPOE o número —
-- `ultimo_numero_id` (da mensagem mais recente: é por ele que a resposta sai) e
-- `numeros_ids` (todos os números da conversa: filtro e breakdown do dash).
DROP VIEW IF EXISTS whatsapp_conversas;

CREATE VIEW whatsapp_conversas
WITH (security_invoker = true) AS
WITH msgs AS (
  SELECT
    r.empresa_id,
    wa_fone_canonico(r.from_phone) AS canon,
    r.from_phone                   AS fone,
    r.recebida_em                  AS em,
    r.texto, r.tipo, r.colaborador_id, r.ambiguidade,
    (r.lida_em IS NULL)            AS nao_lida,
    true                           AS eh_recebida,
    r.to_phone_id                  AS numero_id
  FROM whatsapp_mensagens_recebidas r
  UNION ALL
  SELECT
    e.empresa_id,
    wa_fone_canonico(e.to_phone),
    e.to_phone,
    e.enviada_em,
    coalesce(e.texto, e.template_nome),
    e.tipo, e.colaborador_id, NULL,
    false,
    false,
    e.from_phone_id
  FROM whatsapp_mensagens_enviadas e
)
SELECT
  m.empresa_id,
  (array_agg(m.fone ORDER BY m.em DESC))[1]                                    AS from_phone,
  max(m.em)                                                                    AS ultima_em,
  max(m.em) FILTER (WHERE m.eh_recebida)                                       AS ultima_recebida_em,
  count(*) FILTER (WHERE m.eh_recebida)                                        AS total,
  count(*) FILTER (WHERE NOT m.eh_recebida)                                    AS enviadas,
  count(*) FILTER (WHERE m.eh_recebida AND m.nao_lida)                         AS nao_lidas,
  (array_agg(m.texto ORDER BY m.em DESC))[1]                                   AS ultimo_texto,
  (array_agg(m.tipo  ORDER BY m.em DESC))[1]                                   AS ultimo_tipo,
  (array_agg(CASE WHEN m.eh_recebida THEN 'pessoa' ELSE 'equipe' END ORDER BY m.em DESC))[1] AS ultimo_lado,
  (array_agg(m.colaborador_id ORDER BY m.em DESC) FILTER (WHERE m.colaborador_id IS NOT NULL))[1] AS colaborador_id,
  (array_agg(m.ambiguidade ORDER BY m.em DESC) FILTER (WHERE m.eh_recebida))[1] AS ambiguidade,
  /* O NÚMERO da mensagem mais recente — é por ele que a resposta sai.
     NULL = histórico anterior à gravação do número = número inicial. */
  (array_agg(m.numero_id ORDER BY m.em DESC))[1]                               AS ultimo_numero_id,
  /* Todos os números da conversa — filtro e breakdown do dash. NULLs do
     histórico ficam de fora: array vazio = só histórico sem número. */
  coalesce(
    array_agg(DISTINCT m.numero_id) FILTER (WHERE m.numero_id IS NOT NULL),
    '{}'
  )                                                                            AS numeros_ids
FROM msgs m
GROUP BY m.empresa_id, m.canon;

COMMENT ON VIEW whatsapp_conversas IS
  'Uma linha por (empresa_id, telefone canônico) com os DOIS lados (mig 220) + o NÚMERO (mig 252). ultimo_numero_id = número da mensagem mais recente (é por ele que a resposta sai); numeros_ids = todos os números da conversa (filtro/breakdown). Agrupamento NÃO é por número: a mesma pessoa continua uma conversa só.';

-- ── Postura de acesso (mesma das migs 216/220) ─────────────────────────────
REVOKE ALL ON whatsapp_conversas FROM anon;
REVOKE ALL ON whatsapp_conversas FROM authenticated;
GRANT SELECT ON whatsapp_conversas TO service_role;

-- Rollback (se precisar):
-- ALTER TABLE notification_deliveries DROP COLUMN IF EXISTS from_phone_id;
-- (a view volta a ser a da mig 220 — ver migrations/220-conversas-dois-lados.sql)

