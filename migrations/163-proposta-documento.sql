-- 163 — Documento de proposta (link público + PDF) para o cliente
--
-- Até aqui "enviar ao cliente" era só uma marcação de status; não havia
-- artefato para o cliente. Agora a proposta ganha um token público (capability,
-- não adivinhável) que serve a página /proposta/[token] e o PDF. Rastreia
-- abertura (primeira/última + contagem) para o RC saber que o cliente viu.
ALTER TABLE sales_proposals
  ADD COLUMN IF NOT EXISTS public_token    text UNIQUE,
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_viewed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS view_count      integer NOT NULL DEFAULT 0;
