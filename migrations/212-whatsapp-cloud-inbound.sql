-- 212 — Recebimento e status de entrega da WhatsApp Cloud API.
--
-- POR QUE EXISTE
-- ──────────────
-- Um número na Cloud API NÃO tem aplicativo: ele não é pareado com celular
-- nenhum. Tudo que a pessoa responde chega apenas por webhook, e sem esta
-- migration esse conteúdo não tem onde ser gravado — hoje uma resposta some sem
-- deixar rastro (medido 14/08/2026: `subscribed_apps` da WABA estava vazio).
--
-- E há o ganho que não é sobre inbox: a Cloud API manda STATUS POR MENSAGEM
-- (sent → delivered → read → failed). Até aqui `notification_deliveries.status`
-- só distinguia "o provedor aceitou" de "o provedor recusou" — em 11/08 isso fez
-- um lote ser reportado como "155 enviados" quando 50 chegaram, e em 13/08 as 30
-- evidências que falharam só apareceram porque alguém foi olhar. Com estas
-- colunas, entrega e leitura passam a ser FATO OBSERVADO, não inferência.
--
-- ⚠️ `opened_at` já existia e o comentário dizia que WhatsApp ficaria NULL "por
-- natureza". Deixa de ser verdade: `read` da Cloud API popula essa coluna. O
-- comentário é corrigido abaixo — comentário que descreve uma limitação vencida
-- ensina o errado.

-- ── Mensagens RECEBIDAS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_mensagens_recebidas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Tenant resolvido pelo TELEFONE do remetente. NULL quando não se resolve
  -- (número desconhecido) OU quando o mesmo telefone existe em mais de uma
  -- empresa: nesse caso `ambiguidade` explica, e a linha NÃO é atribuída a um
  -- tenant no chute — atribuir errado é vazamento entre tenants.
  empresa_id     uuid REFERENCES empresas(id) ON DELETE SET NULL,
  colaborador_id uuid REFERENCES colaboradores(id) ON DELETE SET NULL,
  ambiguidade    text,
  /* wamid da Meta — idempotência: o webhook REPETE em caso de erro/timeout. */
  wa_message_id  text NOT NULL,
  from_phone     text NOT NULL,
  to_phone_id    text,
  tipo           text NOT NULL DEFAULT 'text',
  texto          text,
  /* Payload cru: quando o parse errar, a evidência do que chegou fica guardada. */
  raw            jsonb,
  recebida_em    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Idempotência do webhook: a Meta reentrega o mesmo evento até receber 200.
-- Sem esta única, um retry viraria mensagem duplicada na tela de quem atende.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_recebidas_wamid
  ON whatsapp_mensagens_recebidas (wa_message_id);

CREATE INDEX IF NOT EXISTS idx_wa_recebidas_empresa_data
  ON whatsapp_mensagens_recebidas (empresa_id, recebida_em DESC);
CREATE INDEX IF NOT EXISTS idx_wa_recebidas_from
  ON whatsapp_mensagens_recebidas (from_phone, recebida_em DESC);

-- ── Postura de acesso ──────────────────────────────────────────────────────
--
-- Esta tabela guarda PII: telefone e o TEXTO do que a pessoa escreveu. Sem as
-- linhas abaixo ela nasce legível por `anon` — o guard `rls-posture` pegou isso
-- na primeira execução, antes do commit.
--
-- RLS LIGADA E SEM POLICY é o estado desejado aqui, não um esquecimento: sem
-- policy, nega tudo para anon/authenticated (o lado seguro), enquanto uma policy
-- permissiva entregaria o conteúdo. O app lê por service_role, que bypassa RLS —
-- o isolamento entre tenants é feito em CÓDIGO, como todo o resto desta base.
ALTER TABLE whatsapp_mensagens_recebidas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_mensagens_recebidas FROM anon;
REVOKE ALL ON whatsapp_mensagens_recebidas FROM authenticated;

COMMENT ON TABLE whatsapp_mensagens_recebidas IS
  'Mensagens que CHEGAM pelo webhook da Cloud API. Número na Cloud API não tem app: sem esta tabela, resposta de colaborador some. Idempotente por wa_message_id — a Meta reentrega o evento até receber 200.';
COMMENT ON COLUMN whatsapp_mensagens_recebidas.ambiguidade IS
  'Por que empresa_id/colaborador_id ficaram NULL: telefone-desconhecido | telefone-em-multiplas-empresas. Um telefone pode pertencer a pessoas de tenants diferentes, e chutar o tenant é vazamento — a lacuna fica CONTÁVEL em vez de virar atribuição errada.';

-- ── Status de entrega por mensagem ─────────────────────────────────────────
ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_status text;

-- O webhook casa o status com a linha pelo id da mensagem no provedor. Sem este
-- índice, cada evento de status varreria a tabela inteira — e são 3+ eventos por
-- mensagem enviada (sent, delivered, read).
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_provider_msg
  ON notification_deliveries (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

COMMENT ON COLUMN notification_deliveries.provider_message_id IS
  'Id da mensagem no provedor (wamid da Meta). É a chave que liga o evento de status assíncrono à linha do envio.';
COMMENT ON COLUMN notification_deliveries.delivered_at IS
  'Quando o APARELHO recebeu — fato observado, não inferido. `status = sucesso` significa apenas que o provedor aceitou; a distinção custou um relatório errado em 11/08/2026.';
COMMENT ON COLUMN notification_deliveries.failed_at IS
  'Falha reportada pelo provedor DEPOIS do aceite (número inválido, bloqueio, expiração). Uma linha pode ter status=sucesso e failed_at preenchido: aceite e entrega são eventos distintos.';
COMMENT ON COLUMN notification_deliveries.provider_status IS
  'Último status cru do provedor (sent, delivered, read, failed). Guardado sem tradução para que um estado novo da Meta não vire NULL silencioso.';

-- Corrige o comentário vencido: com a Cloud API o WhatsApp passa a reportar leitura.
COMMENT ON COLUMN notification_deliveries.opened_at IS
  'Quando a pessoa LEU. Antes só o push observava isso; desde a Cloud API (14/08/2026) o evento `read` do WhatsApp também popula esta coluna. Continua NULL para e-mail e para o WhatsApp por QR (Z-API), então comparação entre canais tem que dizer QUAL canal consegue observar o quê.';
