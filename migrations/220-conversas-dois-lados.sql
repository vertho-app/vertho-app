-- 220 — A conversa é dos DOIS lados, e o telefone tem DUAS formas.
--
-- POR QUE MEXER NUMA VIEW QUE FUNCIONAVA
-- ──────────────────────────────────────
-- `whatsapp_conversas` (mig 216) agregava só `whatsapp_mensagens_recebidas`.
-- Consequência: a caixa só conhecia quem respondeu. Para quem a cadência mandou
-- e não teve resposta — que é a maioria — não existia conversa nenhuma, então não
-- havia onde ver o que foi enviado, nem para quem o canal está mudo.
--
-- 🔴 E A CHAVE NÃO PODE SER O TELEFONE CRU. Medido em 17/08/2026: o `wa_id` que a
-- Meta usa vem SEM o nono dígito nos DDDs ≥ 31 (`557499225966`), enquanto o envio
-- vai para o cadastro, COM o nono (`5574999225966`). Agrupar pelo texto do
-- telefone partiria a mesma pessoa em DUAS conversas lado a lado na tela — uma
-- com o que ela escreveu, outra com o que mandamos. Daí `wa_fone_canonico`.
--
-- ⚠️ A canônica é chave INTERNA de agrupamento, não o que se exibe: `from_phone`
-- continua sendo o telefone real da última mensagem, que é o que a thread usa
-- para buscar (ela casa as duas formas, ver `lib/whatsapp/nono-digito.ts`).

-- ── A régua do nono dígito, em SQL ────────────────────────────────────────
-- IMMUTABLE porque só depende da entrada — é o que permite indexar por ela
-- depois, se o volume pedir.
CREATE OR REPLACE FUNCTION wa_fone_canonico(fone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    -- 55 + DDD(2) + 9 + 8 dígitos  →  tira o nono. Só celular BR de 13 dígitos.
    WHEN d ~ '^55[1-9][0-9]9[0-9]{8}$' THEN substr(d, 1, 4) || substr(d, 6)
    ELSE d
  END
  FROM (SELECT regexp_replace(coalesce(fone, ''), '\D', '', 'g') AS d) t;
$$;

COMMENT ON FUNCTION wa_fone_canonico(text) IS
  'Forma canônica de um telefone para AGRUPAR conversa: celular BR de 13 dígitos perde o nono, porque é assim que o wa_id da Cloud API chega nos DDDs >= 31. Não use para exibir nem para enviar — para enviar existe foneParaMeta() em lib/whatsapp/cloud-api.ts.';

CREATE INDEX IF NOT EXISTS idx_wa_enviadas_conversa
  ON whatsapp_mensagens_enviadas (empresa_id, to_phone, enviada_em DESC);

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
    true                           AS eh_recebida
  FROM whatsapp_mensagens_recebidas r
  UNION ALL
  SELECT
    e.empresa_id,
    wa_fone_canonico(e.to_phone),
    e.to_phone,
    e.enviada_em,
    /* Sem texto (template antigo, mídia), o rótulo é o que a prévia mostra. */
    coalesce(e.texto, e.template_nome),
    e.tipo, e.colaborador_id, NULL,
    false,
    false
  FROM whatsapp_mensagens_enviadas e
)
SELECT
  m.empresa_id,
  /* O telefone REAL da mensagem mais recente — é ele que vai para a tela. */
  (array_agg(m.fone ORDER BY m.em DESC))[1]                                    AS from_phone,
  max(m.em)                                                                    AS ultima_em,
  /* A janela de 24h é do ÚLTIMO RECEBIDO — nunca do que nós enviamos. Separar as
     duas datas é o que permite a caixa ordenar por atividade sem mentir sobre
     poder responder. NULL = a pessoa nunca escreveu. */
  max(m.em) FILTER (WHERE m.eh_recebida)                                       AS ultima_recebida_em,
  /* `total` segue sendo o que a caixa sempre chamou de total: mensagens DELA.
     É também o discriminador de "conversa" x "só envio" (> 0 = respondeu). */
  count(*) FILTER (WHERE m.eh_recebida)                                        AS total,
  count(*) FILTER (WHERE NOT m.eh_recebida)                                    AS enviadas,
  count(*) FILTER (WHERE m.eh_recebida AND m.nao_lida)                         AS nao_lidas,
  (array_agg(m.texto ORDER BY m.em DESC))[1]                                   AS ultimo_texto,
  (array_agg(m.tipo  ORDER BY m.em DESC))[1]                                   AS ultimo_tipo,
  /* De quem foi a última: a prévia "você: ..." muda o sentido da linha. */
  (array_agg(CASE WHEN m.eh_recebida THEN 'pessoa' ELSE 'equipe' END ORDER BY m.em DESC))[1] AS ultimo_lado,
  /* O vínculo mais recente que EXISTE — `(...)[1]` cru voltava NULL sempre que a
     última mensagem estivesse sem dono, apagando a identidade já conhecida. */
  (array_agg(m.colaborador_id ORDER BY m.em DESC) FILTER (WHERE m.colaborador_id IS NOT NULL))[1] AS colaborador_id,
  (array_agg(m.ambiguidade ORDER BY m.em DESC) FILTER (WHERE m.eh_recebida))[1] AS ambiguidade
FROM msgs m
GROUP BY m.empresa_id, m.canon;

COMMENT ON VIEW whatsapp_conversas IS
  'Uma linha por (empresa_id, telefone canônico) com os DOIS lados da conversa. total = mensagens recebidas (0 = a pessoa nunca respondeu; a caixa filtra por isso), enviadas = o que saiu, ultima_recebida_em = o que abre a janela de 24h. Agrupa por wa_fone_canonico porque o wa_id da Meta e o telefone do cadastro são formas diferentes do mesmo número.';

-- ── Postura de acesso (mesma da mig 216) ──────────────────────────────────
-- PII: telefone e texto de conversa. Só o app (service_role) lê.
REVOKE ALL ON whatsapp_conversas FROM anon;
REVOKE ALL ON whatsapp_conversas FROM authenticated;
GRANT SELECT ON whatsapp_conversas TO service_role;
