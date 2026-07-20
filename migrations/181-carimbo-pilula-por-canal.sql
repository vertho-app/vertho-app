-- 181 — Carimbo da pílula POR CANAL (WhatsApp / e-mail).
--
-- Problema: `triggerDiario` gravava `ultima_pilulaN_em` fora do try/catch
-- (cron-jobs.ts:370), incondicional ao resultado dos envios. Numa queda da Z-API
-- o banco afirmava "pílula enviada" mesmo com ZERO WhatsApp entregue, o
-- `mesmoDiaUTC` bloqueava o reenvio e a /admin/engajamento reportava 100% de
-- recebimento. Observado em produção 20/07/2026 (Ibipeba: 36 carimbos, 0 WhatsApp).
--
-- Correção: cada canal ganha o seu carimbo, gravado SÓ no sucesso daquele canal.
-- `ultima_pilulaN_em` passa a significar "chegou por ALGUM canal" (também só no
-- sucesso), preservando o gate de ciclo e os consumidores existentes.

ALTER TABLE fase4_envios
  ADD COLUMN IF NOT EXISTS ultima_pilula1_whatsapp_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_pilula1_email_em    timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_pilula2_whatsapp_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_pilula2_email_em    timestamptz;

COMMENT ON COLUMN fase4_envios.ultima_pilula1_whatsapp_em IS
  'Quando a 1ª pílula foi ENTREGUE por WhatsApp (só no sucesso do envio). NULL = não saiu por esse canal.';
COMMENT ON COLUMN fase4_envios.ultima_pilula1_email_em IS
  'Quando a 1ª pílula foi ENTREGUE por e-mail (só no sucesso do envio). NULL = não saiu por esse canal.';
COMMENT ON COLUMN fase4_envios.ultima_pilula2_whatsapp_em IS
  'Quando a 2ª pílula (DUO) foi ENTREGUE por WhatsApp (só no sucesso do envio).';
COMMENT ON COLUMN fase4_envios.ultima_pilula2_email_em IS
  'Quando a 2ª pílula (DUO) foi ENTREGUE por e-mail (só no sucesso do envio).';
COMMENT ON COLUMN fase4_envios.ultima_pilula1_em IS
  'Ciclo da 1ª pílula concluído com entrega em ao menos UM canal. Ver ultima_pilula1_{whatsapp,email}_em para o detalhe por canal.';
COMMENT ON COLUMN fase4_envios.ultima_pilula2_em IS
  'Ciclo da 2ª pílula concluído com entrega em ao menos UM canal. Ver ultima_pilula2_{whatsapp,email}_em para o detalhe por canal.';

-- Backfill conservador: para as linhas JÁ carimbadas, o e-mail (Resend) era
-- contabilizado só com r.ok, então tratamos o histórico como "saiu por e-mail".
-- O WhatsApp fica NULL — não há registro que prove entrega no passado, e assumir
-- entrega é exatamente o erro que esta migration existe para corrigir.
UPDATE fase4_envios
   SET ultima_pilula1_email_em = ultima_pilula1_em
 WHERE ultima_pilula1_em IS NOT NULL
   AND ultima_pilula1_email_em IS NULL;

UPDATE fase4_envios
   SET ultima_pilula2_email_em = ultima_pilula2_em
 WHERE ultima_pilula2_em IS NOT NULL
   AND ultima_pilula2_email_em IS NULL;

-- Rollback (se precisar):
-- ALTER TABLE fase4_envios
--   DROP COLUMN IF EXISTS ultima_pilula1_whatsapp_em,
--   DROP COLUMN IF EXISTS ultima_pilula1_email_em,
--   DROP COLUMN IF EXISTS ultima_pilula2_whatsapp_em,
--   DROP COLUMN IF EXISTS ultima_pilula2_email_em;
