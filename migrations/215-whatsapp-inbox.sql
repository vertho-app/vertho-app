-- 215 — Caixa de entrada do WhatsApp: lado ENVIADO + estado de leitura.
--
-- POR QUE UMA TABELA NOVA, e não colunas em `notification_deliveries`
-- ───────────────────────────────────────────────────────────────────
-- `notification_deliveries` (mig 198) é TELEMETRIA DE TODOS OS CANAIS: WhatsApp,
-- e-mail, push, SMS. Ela responde "saiu? chegou? foi lida?" — e faz isso bem.
-- O que ela NÃO tem é o TEXTO, e isso é proposital: guardar corpo de e-mail e de
-- push ali dobraria o volume de PII num lugar cuja função é contar, não guardar.
--
-- Mas uma thread de conversa precisa do texto: sem ele o atendente lê a resposta
-- da pessoa ("Sim") sem saber a que ela respondeu, e conversa pela metade parece
-- defeito. Daí esta tabela, espelho de `whatsapp_mensagens_recebidas` (mig 212).
--
-- ⚠️ AS DUAS NÃO SE DUPLICAM, e a divisão importa:
--   - `whatsapp_mensagens_enviadas`  → CONTEÚDO do que saiu (texto, autor, tipo)
--   - `notification_deliveries`      → STATUS (aceito, entregue, lido, falhou)
-- Ligadas por `wa_message_id` = `provider_message_id`. Guardar status aqui
-- também criaria duas fontes para a mesma pergunta, e elas divergiriam no
-- primeiro webhook que chegasse enquanto uma escrita estivesse em voo.

CREATE TABLE IF NOT EXISTS whatsapp_mensagens_enviadas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid REFERENCES empresas(id) ON DELETE SET NULL,
  colaborador_id uuid REFERENCES colaboradores(id) ON DELETE SET NULL,
  /* wamid da Meta. Une esta linha ao status em notification_deliveries. */
  wa_message_id  text,
  to_phone       text NOT NULL,
  from_phone_id  text,
  /* text = resposta livre na janela · template = mensagem iniciada pela empresa */
  tipo           text NOT NULL DEFAULT 'text',
  texto          text,
  template_nome  text,
  /**
   * Quem enviou. NULL = automático (cadência). Preenchido = resposta humana.
   *
   * A distinção não é burocrática: numa auditoria, "o sistema mandou" e "uma
   * pessoa mandou" são fatos diferentes, e só o segundo tem responsável.
   */
  autor_email    text,
  /* inbox | cadencia — de onde partiu. */
  origem         text NOT NULL DEFAULT 'inbox',
  /**
   * Idempotência do ENVIO. Duplo clique é o caso comum de uma caixa de texto, e
   * sem esta chave a pessoa do outro lado recebe a mesma mensagem duas vezes —
   * o que, num canal de trabalho, é pior que não receber.
   */
  dedupe_key     text,
  erro           text,
  raw            jsonb,
  enviada_em     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Único PARCIAL: `wa_message_id` é NULL quando o envio falhou antes de a Meta
-- devolver o id. Um índice único simples recusaria a segunda falha — e falha
-- precisa ser gravada justamente para aparecer na tela.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_enviadas_wamid
  ON whatsapp_mensagens_enviadas (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- Idempotência por chave do emissor, quando houver.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_enviadas_dedupe
  ON whatsapp_mensagens_enviadas (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_enviadas_empresa_data
  ON whatsapp_mensagens_enviadas (empresa_id, enviada_em DESC);
CREATE INDEX IF NOT EXISTS idx_wa_enviadas_to
  ON whatsapp_mensagens_enviadas (to_phone, enviada_em DESC);

COMMENT ON TABLE whatsapp_mensagens_enviadas IS
  'CONTEÚDO das mensagens que SAEM pelo WhatsApp. Espelho de whatsapp_mensagens_recebidas. O STATUS (entregue/lido) NÃO fica aqui — fica em notification_deliveries, ligado por wa_message_id = provider_message_id. Duas fontes para a mesma pergunta divergiriam.';
COMMENT ON COLUMN whatsapp_mensagens_enviadas.autor_email IS
  'Quem enviou. NULL = automático (cadência); preenchido = resposta humana pela caixa de entrada. Numa auditoria, "o sistema mandou" e "uma pessoa mandou" são fatos diferentes.';
COMMENT ON COLUMN whatsapp_mensagens_enviadas.dedupe_key IS
  'Idempotência do envio. Duplo clique numa caixa de texto é o caso comum — e mensagem duplicada num canal de trabalho é pior que mensagem não enviada.';

-- ── Estado de leitura do INBOUND ──────────────────────────────────────────
--
-- Sem isto, quem atende não distingue "já vi" de "ainda não vi", e a tela vira
-- uma lista onde tudo parece igual. É o mínimo de estado que uma caixa de
-- entrada precisa para ser usável por mais de uma pessoa.
ALTER TABLE whatsapp_mensagens_recebidas
  ADD COLUMN IF NOT EXISTS lida_em timestamptz,
  ADD COLUMN IF NOT EXISTS lida_por text;

COMMENT ON COLUMN whatsapp_mensagens_recebidas.lida_em IS
  'Quando alguém da equipe abriu a conversa. NULL = não lida. Não é o `read` do WhatsApp (aquele é a pessoa lendo o que NÓS mandamos, e vive em notification_deliveries.opened_at) — os dois nomes se parecem e medem lados opostos da conversa.';

CREATE INDEX IF NOT EXISTS idx_wa_recebidas_nao_lidas
  ON whatsapp_mensagens_recebidas (empresa_id, recebida_em DESC)
  WHERE lida_em IS NULL;

-- ── Postura de acesso (mesma da mig 212) ──────────────────────────────────
-- PII: telefone e texto de conversa. RLS ligada SEM policy nega tudo para
-- anon/authenticated; o app lê por service_role e o isolamento é do código.
ALTER TABLE whatsapp_mensagens_enviadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_mensagens_enviadas FROM anon;
REVOKE ALL ON whatsapp_mensagens_enviadas FROM authenticated;
