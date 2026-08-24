-- C3 (auditoria 22/08) — o rastro do lote passa a saber de QUEM ele é.
--
-- 🔴 O problema, achado em revisão do próprio C3 (24/08):
--
-- A idempotência das tasks de lote depende de `ia_jobs.params.batchId`. Entre
-- `createClaudeBatch` retornar e o `patch` gravar esse id existe uma janela; se
-- a run morre ali, o lote está PAGO e ninguém sabe qual job o pediu. A execução
-- seguinte não tem como retomá-lo e cria outro.
--
-- Eu havia documentado essa janela como "sem conserto por código nosso", porque
-- a Batch API da Anthropic não expõe chave de idempotência na criação. Isso é
-- verdade sobre a API — e é irrelevante para o problema: quem precisa lembrar do
-- lote é o NOSSO rastro, não o fornecedor. `ia_batches` já grava a linha no
-- instante da criação; só faltava o vínculo com o job.
--
-- Com `job_id`, a retomada tem uma segunda fonte:
--    SELECT batch_id FROM ia_batches
--     WHERE job_id = $1 AND status = 'submetido' ORDER BY criado_em DESC LIMIT 1
-- e a janela deixa de custar um lote.
--
-- Sem FK para `ia_jobs` de propósito: o rastro é observabilidade e não pode
-- impedir a escrita se o job for apagado (o `logAdminAction` já ensinou que FK
-- em tabela de rastro cega justamente o caso que mais importa — auditoria 22/08).
--
-- Idempotente: pode rodar de novo sem efeito.

ALTER TABLE ia_batches
  ADD COLUMN IF NOT EXISTS job_id uuid;

COMMENT ON COLUMN ia_batches.job_id IS
  'ia_jobs.id que pediu este lote (C3, 24/08/2026). Existe para recuperar o batch pago quando params.batchId não chegou a ser gravado. Sem FK: rastro não pode falhar por causa do alvo.';

CREATE INDEX IF NOT EXISTS idx_ia_batches_job_submetido
  ON ia_batches (job_id, criado_em DESC)
  WHERE job_id IS NOT NULL AND status = 'submetido';
