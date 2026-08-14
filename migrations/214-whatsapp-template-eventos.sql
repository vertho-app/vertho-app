-- 214 — Histórico de status e CATEGORIA dos templates do WhatsApp.
--
-- POR QUE EXISTE (medido em 14/08/2026)
-- ────────────────────────────────────
-- A categoria devolvida na criação de um template é PROVISÓRIA. `pilula_semanal`
-- foi criado como UTILITY, ficou assim por ~20 minutos e virou MARKETING durante
-- a revisão; `missao_aplicacao`, `nudge_inatividade` e `missao_semana` idem. De
-- 8 templates submetidos como UTILITY naquele dia, 4 voltaram MARKETING.
--
-- Isso não é detalhe de processo: UTILITY custa R$ 0,06–0,09 no Brasil e
-- MARKETING custa R$ 0,40–0,55 — **6×**. Um template que muda de categoria
-- depois de aprovado multiplica o custo do canal sem nenhum sinal no produto.
--
-- Até aqui a única forma de saber era CONSULTAR NA MÃO, template por template.
-- A Meta emite `message_template_status_update` e `message_template_category_update`
-- pelo mesmo webhook que já recebe mensagens (mig 212) — esta tabela é onde eles
-- pousam.
--
-- ⚠️ O QUE ISTO NÃO É: não é a fonte da verdade da categoria. A fonte é a Graph
-- API. Isto é o HISTÓRICO — serve para responder "quando virou marketing?" e
-- "quanto tempo ficou pendente?", que a consulta ao vivo não responde porque só
-- mostra o estado de agora.

CREATE TABLE IF NOT EXISTS whatsapp_template_eventos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_id            text,
  template_id        text,
  template_nome      text NOT NULL,
  template_idioma    text,
  /* status_update | category_update */
  tipo_evento        text NOT NULL,
  /* APPROVED | REJECTED | PENDING | FLAGGED | PAUSED … (cru, sem tradução) */
  evento             text,
  categoria_anterior text,
  categoria_nova     text,
  motivo             text,
  raw                jsonb,
  ocorrido_em        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_tpl_eventos_nome
  ON whatsapp_template_eventos (template_nome, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_wa_tpl_eventos_data
  ON whatsapp_template_eventos (ocorrido_em DESC);

COMMENT ON TABLE whatsapp_template_eventos IS
  'Histórico de status/categoria dos templates, alimentado pelo webhook da Cloud API. A categoria devolvida na criação é PROVISÓRIA e muda durante a revisão (4 de 8 mudaram em 14/08/2026) — sem histórico, a virada de UTILITY para MARKETING (6× o custo) é invisível.';
COMMENT ON COLUMN whatsapp_template_eventos.categoria_nova IS
  'Categoria após a mudança. `MARKETING` aqui vindo de `UTILITY` é o evento caro: registra degradação crítica no código, porque multiplica por ~6 o custo daquele template.';
COMMENT ON COLUMN whatsapp_template_eventos.evento IS
  'Status cru do provedor, sem tradução — um estado novo da Meta não pode virar NULL silencioso.';

-- Mesma postura da mig 212: a tabela não tem PII de colaborador, mas expõe a
-- operação de comunicação do negócio. RLS ligada SEM policy nega tudo para
-- anon/authenticated; o app lê por service_role.
ALTER TABLE whatsapp_template_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_template_eventos FROM anon;
REVOKE ALL ON whatsapp_template_eventos FROM authenticated;
