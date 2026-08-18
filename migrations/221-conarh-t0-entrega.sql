-- 221 — CONARH 52: rastro da entrega do T+0 (o recorte que o lead pediu no estande)
--
-- POR QUÊ (medido 18/08/2026, dia 1 da feira):
--   `app/api/conarh/artefato` marcava `followup_step = 1` ("T+0 executado") mesmo
--   quando o WhatsApp E o e-mail falhavam. Com `recorte_demonstracao` PENDING na
--   Meta e a Z-API desconectada desde 11/08, NADA saía — e o lead ficava
--   indistinguível de quem recebeu. Os 2 leads de `conarh-2026` estavam em step 1
--   sem nenhum envio comprovado, e 0 deles tinham e-mail (o fallback não cobre).
--
--   Sem estas colunas não existe a pergunta "quem ficou devendo?", e três dias de
--   feira depois a lista não se reconstrói.
--
-- O MODELO é o `pdf_*` da mesma tabela (status/erro/gerado_em) — mesma forma,
-- mesmo vocabulário, para não inventar um segundo dialeto de entrega.
--
-- 🔑 `t0_status` é a FILA. Não há tabela de outbox: o lead com T+0 não entregue
--    É o item pendente. Quem varre: `lib/conarh/reenvio-t0.ts`.

ALTER TABLE diag_leads
  ADD COLUMN IF NOT EXISTS t0_status      text        NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS t0_canal       text,
  ADD COLUMN IF NOT EXISTS t0_erro        text,
  ADD COLUMN IF NOT EXISTS t0_tentativas  smallint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS t0_tentado_em  timestamptz,
  ADD COLUMN IF NOT EXISTS t0_enviado_em  timestamptz;

-- Literal fechado: status fora da lista é erro de escrita, não estado novo.
-- (O par em código é ENTREGA_T0_STATUS, em lib/conarh/entrega-t0.ts.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'diag_leads_t0_status_check'
  ) THEN
    ALTER TABLE diag_leads
      ADD CONSTRAINT diag_leads_t0_status_check
      CHECK (t0_status IN ('pendente', 'enviado', 'falhou', 'desconhecido'));
  END IF;
END $$;

-- Backfill: quem já existe NÃO entra no despejo automático.
--
-- ⚠️ 'desconhecido', não 'pendente'. Estes leads foram capturados quando o worker
--    não media a entrega: afirmar que não receberam seria tão inventado quanto o
--    `followup_step = 1` que este commit tira. Um deles é de 04/08, antes da queda
--    da Z-API — pode ter recebido, e reenviar o recorte a quem já leu é ruído.
--    Ficam VISÍVEIS na tela da equipe e podem ser disparados um a um, à mão.
UPDATE diag_leads SET t0_status = 'desconhecido' WHERE t0_status = 'pendente';

-- A fila de reenvio: parcial, porque 'enviado' é o estado terminal e o que se
-- varre é sempre o resto. Não é UNIQUE — não há ON CONFLICT nesta tabela.
CREATE INDEX IF NOT EXISTS idx_diag_leads_t0_pendente
  ON diag_leads (scope_id, criado_em)
  WHERE t0_status IN ('pendente', 'falhou');

COMMENT ON COLUMN diag_leads.t0_status IS
  'Entrega do T+0 (recorte): pendente | enviado | falhou | desconhecido. É a fila — não existe tabela de outbox.';
COMMENT ON COLUMN diag_leads.t0_canal IS
  'Por onde o T+0 chegou de fato: whatsapp | email | whatsapp+email. Null enquanto não entregou.';
