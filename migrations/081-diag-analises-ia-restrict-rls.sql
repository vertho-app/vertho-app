-- Migration 081 — Fechar leitura pública de diag_analises_ia
-- Auditoria estática (abr/2026): a policy "diag_analises_public_read" da migration 054
-- expunha o conteúdo de análises geradas por IA (textos da proposta, narrativas) ao
-- cliente anônimo via PostgREST. Toda leitura/escrita em app code usa createSupabaseAdmin()
-- (service role) que ignora RLS — então remover a policy não quebra nada.

DROP POLICY IF EXISTS "diag_analises_public_read" ON diag_analises_ia;

-- Sem policy de SELECT/INSERT/UPDATE = anon e authenticated bloqueados; service_role passa.
