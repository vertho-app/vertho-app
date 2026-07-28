-- 195: lead comercial — identidade por telefone, origem em coluna própria
--
-- Motivador concreto: a captura de lead em feira coleta WhatsApp, não e-mail.
-- Do jeito que estava, `capturarLeadComercial` rejeitava TODO lead sem e-mail
-- (EMAIL_RE obrigatório) — num stand isso significa voltar sem contato nenhum.
--
-- Três mudanças, todas verificadas contra os consumidores atuais:
--   1. email deixa de ser NOT NULL. Quem lê a tabela já aguenta: a rota de PDF
--      trata a ausência explicitamente (`sem-email`, app/api/radar/lead-pdf) e
--      as telas de funil só CONTAM linhas. Nenhuma exibe o e-mail.
--   2. telefone e origem viram colunas. Antes iam concatenados dentro de
--      `organizacao` como texto livre ("WhatsApp: … · Origem: …"), o que torna
--      qualquer segmentação de follow-up um trabalho manual.
--   3. CHECK garante que todo lead tem PELO MENOS uma forma de contato — sem
--      isso, "aceitar sem e-mail" viraria "aceitar lead que ninguém consegue
--      responder".
-- Idempotente.

ALTER TABLE diag_leads ALTER COLUMN email DROP NOT NULL;

ALTER TABLE diag_leads ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE diag_leads ADD COLUMN IF NOT EXISTS origem   TEXT;

COMMENT ON COLUMN diag_leads.email IS
  'E-mail do lead. NULLABLE desde a mig 195: captura em feira coleta só WhatsApp. Todo lead tem email OU telefone (ver CHECK).';
COMMENT ON COLUMN diag_leads.telefone IS
  'Telefone em E.164 (normalizado na action). Serve como IDENTIDADE do lead quando não há e-mail: dedup e rate limit usam os dois.';
COMMENT ON COLUMN diag_leads.origem IS
  'De onde veio o lead (home, header, evento-conarh…). Era concatenado dentro de organizacao; em coluna própria, dá para segmentar o follow-up.';

-- Contato obrigatório: um dos dois. NOT VALID evita varrer a tabela inteira
-- agora; as linhas antigas têm e-mail (a coluna era NOT NULL até aqui), então
-- a validação abaixo passa — e fica registrada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'diag_leads_contato_obrigatorio'
  ) THEN
    ALTER TABLE diag_leads
      ADD CONSTRAINT diag_leads_contato_obrigatorio
      CHECK (
        (email IS NOT NULL AND length(btrim(email)) > 0)
        OR (telefone IS NOT NULL AND length(btrim(telefone)) > 0)
      ) NOT VALID;
    ALTER TABLE diag_leads VALIDATE CONSTRAINT diag_leads_contato_obrigatorio;
  END IF;
END $$;

-- Dedup por telefone (o índice de email já existe pelo uso histórico da coluna)
CREATE INDEX IF NOT EXISTS idx_diag_leads_telefone
  ON diag_leads (telefone, scope_type, criado_em DESC)
  WHERE telefone IS NOT NULL;

-- Rate limit e relatório por origem
CREATE INDEX IF NOT EXISTS idx_diag_leads_origem
  ON diag_leads (origem, criado_em DESC)
  WHERE origem IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar):
-- DROP INDEX IF EXISTS idx_diag_leads_origem;
-- DROP INDEX IF EXISTS idx_diag_leads_telefone;
-- ALTER TABLE diag_leads DROP CONSTRAINT IF EXISTS diag_leads_contato_obrigatorio;
-- ALTER TABLE diag_leads DROP COLUMN IF EXISTS origem;
-- ALTER TABLE diag_leads DROP COLUMN IF EXISTS telefone;
-- -- (email volta a NOT NULL só se não houver linha com email nulo)
