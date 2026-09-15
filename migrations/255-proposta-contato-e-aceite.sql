-- 255 — Contato comercial na proposta + aceite registrado pelo cliente.
--
-- POR QUE EXISTE (decisões do dono em 14/09/2026)
--
--   1. CONTATO. O documento público mostra "Seu contato na Vertho" a partir de
--      `sales_representatives`. A proposta nascida do deal desk não tem RC
--      (mig 254), então o bloco saía com o rótulo genérico "Representante
--      Vertho" e SEM e-mail nem telefone — um documento comercial que não diz
--      com quem falar. DECISÃO: o contato passa a ser campo da PRÓPRIA proposta,
--      obrigatório na conversão do orçamento. Quando há RC, ele continua sendo a
--      fonte (o contato do RC é o RC); estas colunas têm precedência quando
--      preenchidas.
--
--   2. ACEITE. O cliente só podia "aceitar" por fora (e-mail/WhatsApp) e alguém
--      da Vertho marcava na mão (`markProposalAccepted`, `marcarPropostaAceitaAdmin`).
--      DECISÃO: a página pública ganha aceite formal. Como é escrita SEM SESSÃO,
--      o aceite só vale identificado: nome, cargo e e-mail de quem clicou, mais
--      data, IP e user-agent. Sem isso, "alguém com o link aceitou" não é
--      manifestação de vontade atribuível a ninguém.
--
-- ⚠️ FRONTEIRA DE CONFIANÇA: `accepted_by_*` é texto DIGITADO por quem abriu o
-- link — é declaração do cliente, não identidade verificada. `accepted_ip` e
-- `accepted_user_agent` são a trilha técnica que acompanha a declaração. Quem
-- ler essas colunas numa tela precisa saber disso: não são dado autenticado.
--
-- COMPATIBILIDADE: tudo aditivo. Nenhuma linha existente muda de valor.

-- ── 1) Contato comercial do documento ───────────────────────────────────────

ALTER TABLE sales_proposals ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE sales_proposals ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE sales_proposals ADD COLUMN IF NOT EXISTS contact_phone text;

COMMENT ON COLUMN sales_proposals.contact_name IS
  'Nome de quem assina o documento pela Vertho (mig 255). Obrigatório na conversão do deal desk; tem precedência sobre sales_representatives.name quando preenchido.';
COMMENT ON COLUMN sales_proposals.contact_email IS
  'E-mail de contato mostrado ao cliente no documento público (mig 255).';
COMMENT ON COLUMN sales_proposals.contact_phone IS
  'WhatsApp do contato em E.164 SEM "+" (ex.: 5511911807809), normalizado por lib/phone.validateWhatsApp (mig 255). É o que monta o link wa.me do documento — guardar formatado quebraria o link.';

-- ── 2) Aceite registrado na página pública ──────────────────────────────────

ALTER TABLE sales_proposals ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE sales_proposals ADD COLUMN IF NOT EXISTS accepted_by_name text;
ALTER TABLE sales_proposals ADD COLUMN IF NOT EXISTS accepted_by_role text;
ALTER TABLE sales_proposals ADD COLUMN IF NOT EXISTS accepted_by_email text;
ALTER TABLE sales_proposals ADD COLUMN IF NOT EXISTS accepted_ip text;
ALTER TABLE sales_proposals ADD COLUMN IF NOT EXISTS accepted_user_agent text;

COMMENT ON COLUMN sales_proposals.accepted_at IS
  'Quando o cliente aceitou pela página pública (mig 255). NULL numa proposta com status=accepted significa aceite marcado internamente, não pelo cliente.';
COMMENT ON COLUMN sales_proposals.accepted_by_name IS
  'Nome DIGITADO por quem aceitou no link público (mig 255). Declaração do cliente, não identidade verificada.';
COMMENT ON COLUMN sales_proposals.accepted_by_role IS
  'Cargo digitado por quem aceitou (mig 255). Serve para saber se quem clicou tinha alçada.';
COMMENT ON COLUMN sales_proposals.accepted_by_email IS
  'E-mail digitado por quem aceitou (mig 255). Canal para confirmar o aceite de volta.';
COMMENT ON COLUMN sales_proposals.accepted_ip IS
  'IP de origem do aceite (x-forwarded-for), trilha técnica da declaração (mig 255).';
COMMENT ON COLUMN sales_proposals.accepted_user_agent IS
  'User-agent de origem do aceite, truncado em 300 chars (mig 255).';

-- Fila "aceitou e ninguém respondeu": índice parcial, só nas linhas aceitas.
CREATE INDEX IF NOT EXISTS idx_sales_proposals_accepted_at
  ON sales_proposals (accepted_at DESC)
  WHERE accepted_at IS NOT NULL;

-- ── Postura de acesso ───────────────────────────────────────────────────────
-- sales_proposals é service_role-only (mig 159): RLS ligada, sem grant para
-- anon/authenticated. A escrita do aceite entra pelo service_role da action
-- pública `registrarAceitePublico`, que valida o token antes de gravar — o
-- cliente NUNCA fala com o PostgREST. Nada a mudar aqui.

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar):
-- DROP INDEX IF EXISTS idx_sales_proposals_accepted_at;
-- ALTER TABLE sales_proposals DROP COLUMN IF EXISTS accepted_user_agent;
-- ALTER TABLE sales_proposals DROP COLUMN IF EXISTS accepted_ip;
-- ALTER TABLE sales_proposals DROP COLUMN IF EXISTS accepted_by_email;
-- ALTER TABLE sales_proposals DROP COLUMN IF EXISTS accepted_by_role;
-- ALTER TABLE sales_proposals DROP COLUMN IF EXISTS accepted_by_name;
-- ALTER TABLE sales_proposals DROP COLUMN IF EXISTS accepted_at;
-- ALTER TABLE sales_proposals DROP COLUMN IF EXISTS contact_phone;
-- ALTER TABLE sales_proposals DROP COLUMN IF EXISTS contact_email;
-- ALTER TABLE sales_proposals DROP COLUMN IF EXISTS contact_name;
-- ⚠️ apagar accepted_* descarta a trilha de aceites já registrados.
