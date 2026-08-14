-- 213 — Evidência de quinta deixa de ser MONOCANAL.
--
-- O QUE ESTAVA ERRADO (medido em 13/08/2026)
-- ──────────────────────────────────────────
-- A pílula de segunda/terça sai por três canais (WhatsApp, e-mail, push), cada um
-- com carimbo próprio e recuperável. A EVIDÊNCIA de quinta saía só por WhatsApp:
-- `trigger-diario-empresa.ts` tinha um `if (telefone) { ... }` e nada mais.
--
-- Em 13/08 a instância Z-API caiu no meio do disparo da Ibipeba: 6 de 36
-- entregues, 30 pessoas sem nada. As 36 têm e-mail cadastrado e o Resend não
-- falhou nenhuma vez nos 194 envios medidos — ou seja, o canal que teria salvado
-- as 30 já existia, já estava pago e simplesmente não era usado naquele dia.
--
-- ⚠️ POR QUE ISTO É UMA MIGRATION, E NÃO SÓ CÓDIGO: sem carimbo POR CANAL, o
-- `ultima_evidencia_em` (que é um só) marcaria "evidência processada" assim que
-- QUALQUER canal saísse — e então bloquearia a recuperação do canal que falhou.
-- É exatamente o bug que a mig 202 corrigiu para a pílula; repeti-lo aqui seria
-- reintroduzi-lo no fluxo vizinho.
--
-- ⚠️ `ultima_evidencia_em` NÃO é substituído: ele continua sendo a alavanca do
-- AVANÇO DE SEMANA, que é uma decisão de produto separada da entrega e que só
-- pode acontecer UMA vez por dia. Os dois papéis, que hoje moram na mesma coluna,
-- passam a ser distinguíveis: entrega olha os carimbos por canal; calendário olha
-- o consolidado.

ALTER TABLE fase4_envios
  ADD COLUMN IF NOT EXISTS ultima_evidencia_whatsapp_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_evidencia_email_em    timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_evidencia_push_em     timestamptz;

COMMENT ON COLUMN fase4_envios.ultima_evidencia_whatsapp_em IS
  'Quando a evidência saiu por WhatsApp. Gravado pelo webhook APÓS o envio confirmado (mesmo contrato da pílula), não no enfileiramento — carimbar no publish afirmaria envio que pode não ter acontecido.';
COMMENT ON COLUMN fase4_envios.ultima_evidencia_email_em IS
  'Quando a evidência saiu por e-mail. Síncrono: o Resend responde na hora, então o carimbo é gravado no mesmo request.';
COMMENT ON COLUMN fase4_envios.ultima_evidencia_push_em IS
  'Quando a evidência saiu por push. Só carimba com entregues > 0 — inscrição morta (404/410) não conta como entrega.';
COMMENT ON COLUMN fase4_envios.ultima_evidencia_em IS
  'Consolidado da quinta: marca que o dia FOI PROCESSADO e é o gate do avanço de semana (semana_atual + 1). NÃO serve para decidir se um canal precisa ser reenviado — para isso são os carimbos por canal (mig 213). Manter os dois papéis nesta coluna foi o que tornou a evidência monocanal recuperável apenas por inteiro.';
