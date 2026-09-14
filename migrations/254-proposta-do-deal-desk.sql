-- 254 — Proposta nascida do deal desk: sem RC, com a vigência do orçamento.
--
-- POR QUE EXISTE
-- Até aqui toda proposta nascia de um RC (`createProposalDraft`, mig 159) e só
-- podia existir dentro de uma oportunidade aberta dele. O deal desk
-- (/admin/vertho/orcamento) passou a salvar cenários (mig 253) e o passo natural
-- é virar proposta — mas três coisas impediam, e as três são decisão do dono em
-- 14/09/2026, não detalhe de implementação:
--
--   1. `representante_id` era NOT NULL. Um orçamento precificado pela Vertho não
--      pertence a nenhum RC, e inventar um RC fictício distorceria o ledger de
--      comissão. DECISÃO: proposta de admin NÃO se associa a RC nenhum.
--   2. `contract_duration_months` tinha CHECK IN (12,24,36). O orçamento parcela
--      por ENTREGA: `parcelas = ciclos × 2` (MESES_POR_CICLO), então uma jornada
--      de 7 semanas são 2 parcelas. DECISÃO: preservar as parcelas do orçamento.
--   3. Não havia como uma proposta sem RC avançar: `submitProposalForApproval`,
--      `markProposalSentToClient`, `markProposalAccepted` e `gerarLinkProposta`
--      passam por `requireRepresentativeAction` + `assertRepresentativeOwnership`,
--      que lança com `representante_id` nulo. DECISÃO: o admin ganha o ciclo de
--      vida completo (actions/sales/proposals-admin.ts).
--
-- ⚠️ CONSEQUÊNCIAS ACEITAS EXPLICITAMENTE
--
--   · QUATRO OLHOS: a regra "RC cria e submete, admin aprova, nunca a própria
--     proposta" não se aplica aqui — quem cria é quem aprova. `created_by_email`
--     (novo) existe para que isso fique VISÍVEL na linha depois do fato, já que
--     o controle deixou de existir.
--   · SEM COMISSÃO: `sales_commission_events.representante_id` continua NOT NULL.
--     Proposta sem RC não materializa evento de comissão no aceite — não há quem
--     receba. `marcarPropostaAceitaAdmin` salta esse passo de propósito.
--   · RENOVAÇÃO: `markProposalAccepted` calcula `renewal_date = início +
--     contract_duration_months`. Com vigência 2 (uma jornada), a renovação fica a
--     2 meses e `RENEWAL_SOON_DAYS = 90` acende "renovação próxima" na hora. É
--     efeito esperado de vender por projeto e não por assinatura — a coluna
--     descreve o fim do que foi vendido, não um ciclo anual.
--
-- COMPATIBILIDADE: tudo aditivo ou afrouxamento. Nenhuma linha existente muda de
-- valor; o CHECK novo é estritamente mais largo que o antigo (12/24/36 ⊂ 1..360).

-- ── 1) Proposta pode não ter RC ─────────────────────────────────────────────

ALTER TABLE sales_proposals ALTER COLUMN representante_id DROP NOT NULL;

ALTER TABLE sales_proposals ADD COLUMN IF NOT EXISTS created_by_email text;

COMMENT ON COLUMN sales_proposals.representante_id IS
  'RC dono da proposta. NULL (mig 254) = proposta criada pela Vertho no deal desk, sem RC: não gera evento de comissão e só o admin a opera (actions/sales/proposals-admin.ts).';

COMMENT ON COLUMN sales_proposals.created_by_email IS
  'E-mail do platform admin que criou a proposta (mig 254). Preenchido só no caminho do deal desk; no fluxo do RC o autor é o representante_id. Existe para tornar visível que, neste caminho, quem cria é quem aprova.';

-- ── 2) Vigência aceita o número real de parcelas do orçamento ───────────────
-- Drop pelo nome REAL lido de pg_constraint (nunca hardcoded — padrão das migs
-- 166/168). Exclui o constraint novo para a migration ser reaplicável.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'sales_proposals'::regclass
       AND contype = 'c'
       AND conname <> 'sales_proposals_vigencia_positiva'
       AND pg_get_constraintdef(oid) LIKE '%contract_duration_months%'
  LOOP
    EXECUTE format('ALTER TABLE sales_proposals DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'sales_proposals'::regclass
       AND conname = 'sales_proposals_vigencia_positiva'
  ) THEN
    ALTER TABLE sales_proposals ADD CONSTRAINT sales_proposals_vigencia_positiva
      CHECK (contract_duration_months IS NULL
             OR (contract_duration_months > 0 AND contract_duration_months <= 360));
  END IF;
END $$;

COMMENT ON COLUMN sales_proposals.contract_duration_months IS
  'Meses do contrato. 12/24/36 no formulário do RC (CONTRACT_DURATIONS); qualquer valor 1..360 quando vem do deal desk, onde a vigência é o número de parcelas do projeto (ciclos × 2). CHECK afrouxado na mig 254.';

-- ── 3) Nome do cliente quando não há conta no CRM ───────────────────────────
-- `sales_accounts.representante_id` é NOT NULL, então não existe conta sem RC.
-- O deal desk orça para prospect que ainda não está no CRM: sem esta coluna, o
-- documento público cairia no fallback genérico 'Cliente' (buildProposalDocument).
ALTER TABLE sales_proposals ADD COLUMN IF NOT EXISTS cliente_nome text;

COMMENT ON COLUMN sales_proposals.cliente_nome IS
  'Nome do cliente em texto livre, usado pelo documento público quando não há account_id (mig 254). Vem do campo "cliente" do orçamento salvo. account_id, quando existe, tem precedência.';

-- ── 4) Vínculo orçamento → proposta ─────────────────────────────────────────
ALTER TABLE orcamento_cenarios
  ADD COLUMN IF NOT EXISTS proposta_id uuid REFERENCES sales_proposals(id) ON DELETE SET NULL;

COMMENT ON COLUMN orcamento_cenarios.proposta_id IS
  'Proposta gerada a partir deste cenário (mig 254). NULL = ainda não convertido. ON DELETE SET NULL: apagar a proposta desvincula o orçamento, e apagar o orçamento não derruba a proposta (que já pode ter ido ao cliente).';

CREATE INDEX IF NOT EXISTS idx_orcamento_cenarios_proposta
  ON orcamento_cenarios (proposta_id)
  WHERE proposta_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_proposals_cliente_nome
  ON sales_proposals (cliente_nome)
  WHERE cliente_nome IS NOT NULL;

-- ── Postura de acesso ───────────────────────────────────────────────────────
-- sales_proposals já é service_role-only (mig 159) e orcamento_cenarios idem
-- (mig 253): RLS ligada, sem grant para anon/authenticated. Nada a mudar.

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar — a ordem importa, o vínculo sai antes das colunas):
-- DROP INDEX IF EXISTS idx_sales_proposals_cliente_nome;
-- DROP INDEX IF EXISTS idx_orcamento_cenarios_proposta;
-- ALTER TABLE orcamento_cenarios DROP COLUMN IF EXISTS proposta_id;
-- ALTER TABLE sales_proposals DROP COLUMN IF EXISTS cliente_nome;
-- ALTER TABLE sales_proposals DROP CONSTRAINT IF EXISTS sales_proposals_vigencia_positiva;
-- ALTER TABLE sales_proposals ADD CONSTRAINT sales_proposals_contract_duration_months_check
--   CHECK (contract_duration_months IS NULL OR contract_duration_months IN (12,24,36));
-- ALTER TABLE sales_proposals DROP COLUMN IF EXISTS created_by_email;
-- ALTER TABLE sales_proposals ALTER COLUMN representante_id SET NOT NULL;
-- ⚠️ os dois últimos só funcionam se nenhuma proposta sem RC / fora de 12-24-36
--    tiver sido criada: antes, DELETE nessas linhas ou preencha representante_id.
