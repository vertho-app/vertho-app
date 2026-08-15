-- 216 — Conversas do WhatsApp agregadas no BANCO, não em memória.
--
-- POR QUE UMA VIEW, e não `group by` em JavaScript
-- ────────────────────────────────────────────────
-- A primeira versão da caixa de entrada lia as últimas 500 mensagens de uma
-- empresa e agrupava por telefone no servidor Node. Funciona com uma conversa e
-- mente com cinquenta: quem fala muito ENGOLE a cota, e as conversas de todo
-- mundo somem da lista sem nenhum erro na tela — some a mais antiga primeiro,
-- que é exatamente a que estava esperando resposta.
--
-- Na caixa GLOBAL (todas as empresas, mig 216) isso deixaria de ser risco e
-- viraria certeza: 500 mensagens dividido por N tenants não é uma amostra útil
-- de nada. A agregação tem que acontecer onde estão todas as linhas.
--
-- ⚠️ `security_invoker = true` NÃO É DETALHE. Uma view comum roda com os
-- privilégios de QUEM A CRIOU (o dono, superusuário) — então uma view sobre
-- tabela com RLS entrega o conteúdo inteiro a qualquer role que tenha SELECT
-- nela, com a RLS da base contornada. Foi assim que duas materialized views
-- ficaram legíveis por `anon` até a mig 207. Aqui vão as duas defesas: o REVOKE
-- (ninguém além do service_role enxerga) e o `security_invoker` (se alguém
-- conceder acesso amanhã, a RLS da tabela base volta a valer para o chamador).

-- ── Índice de apoio ───────────────────────────────────────────────────────
-- O agrupamento é por (empresa_id, from_phone) e a ordenação por data. Sem
-- isto, cada abertura da caixa é um seq scan na tabela inteira de mensagens.
CREATE INDEX IF NOT EXISTS idx_wa_recebidas_conversa
  ON whatsapp_mensagens_recebidas (empresa_id, from_phone, recebida_em DESC);

DROP VIEW IF EXISTS whatsapp_conversas;

CREATE VIEW whatsapp_conversas
WITH (security_invoker = true) AS
SELECT
  m.empresa_id,
  m.from_phone,
  max(m.recebida_em)                                            AS ultima_em,
  count(*)                                                      AS total,
  /* Não lidas PELA EQUIPE (lida_em de mig 215). Não confundir com o `read` do
     WhatsApp, que é a pessoa lendo o que NÓS mandamos e vive noutra tabela. */
  count(*) FILTER (WHERE m.lida_em IS NULL)                     AS nao_lidas,
  /* Estado da conversa = estado da ÚLTIMA mensagem. `array_agg` ordenado é o
     jeito de trazer o campo da linha mais recente junto com o agregado, sem uma
     segunda passada pela tabela. */
  (array_agg(m.texto          ORDER BY m.recebida_em DESC))[1]  AS ultimo_texto,
  (array_agg(m.tipo           ORDER BY m.recebida_em DESC))[1]  AS ultimo_tipo,
  (array_agg(m.colaborador_id ORDER BY m.recebida_em DESC))[1]  AS colaborador_id,
  (array_agg(m.ambiguidade    ORDER BY m.recebida_em DESC))[1]  AS ambiguidade
FROM whatsapp_mensagens_recebidas m
GROUP BY m.empresa_id, m.from_phone;

COMMENT ON VIEW whatsapp_conversas IS
  'Uma linha por (empresa_id, from_phone): última mensagem, total e não lidas pela equipe. Existe para a caixa de entrada não agrupar em memória sobre uma janela truncada — com N tenants, um telefone tagarela esconderia as conversas dos outros. empresa_id NULL = telefone não resolvido (fila de não identificadas).';

-- ── Postura de acesso ─────────────────────────────────────────────────────
-- PII: telefone e texto de conversa. Só o app (service_role) lê.
REVOKE ALL ON whatsapp_conversas FROM anon;
REVOKE ALL ON whatsapp_conversas FROM authenticated;
GRANT SELECT ON whatsapp_conversas TO service_role;
