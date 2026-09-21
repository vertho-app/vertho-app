-- Primeiros marcos, retidos somente enquanto existir o convite. Sem respostas ou PII nova.
ALTER TABLE public.demo_prospect_sessions
  ADD COLUMN IF NOT EXISTS contact_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS relevant_exploration_at timestamptz,
  ADD COLUMN IF NOT EXISTS relevant_exploration_target text,
  ADD COLUMN IF NOT EXISTS telemetry_version text,
  ADD COLUMN IF NOT EXISTS is_internal_test boolean NOT NULL DEFAULT false;
-- telemetry_version NÃO tem default/backfill: só o código instrumentado marca novos convites.
COMMENT ON COLUMN public.demo_prospect_sessions.contact_clicked_at IS 'Primeiro clique no contato. Não comprova envio de mensagem.';
COMMENT ON COLUMN public.demo_prospect_sessions.relevant_exploration_at IS 'Primeira visualização de conteúdo carregado com sucesso na allowlist do funil.';
NOTIFY pgrst, 'reload schema';
