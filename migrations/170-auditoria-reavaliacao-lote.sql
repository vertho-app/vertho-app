-- 170 — Lote de reavaliação da Sem 14 em background (Trigger.dev)
--
-- A reavaliação em lote (regerar scoring com feedback da auditoria pra N
-- avaliações) roda numa task Trigger.dev (trigger/reavaliar-lote-sem14.ts),
-- já que cada item custa ~2 chamadas de IA (~2-3 min) e N×isso excede o
-- maxDuration de uma server action. Esta tabela rastreia o lote pra polling
-- do admin ver progresso ("Reavaliando X/Y") e resultado ao final.
--
-- Acesso: service-role only (RLS sem policy — mesmo padrão do admin_audit_log).
-- As actions (iniciarReavaliacaoLote/statusReavaliacaoLote) e a task usam
-- requireAdminSupabase()/createSupabaseAdmin(), que bypassam RLS.
--
--   • status        — 'processing' | 'done'
--   • processados   — quantos itens já terminaram (ok ou erro)
--   • erros         — [{ progressoId, colaborador, error }] (jsonb)
--   • empresa_id    — null = platform admin Vertho (lote inter-tenant)

CREATE TABLE IF NOT EXISTS public.auditoria_reavaliacao_lote (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progresso_ids uuid[] NOT NULL,
  total         integer NOT NULL,
  processados   integer NOT NULL DEFAULT 0,
  erros         jsonb   NOT NULL DEFAULT '[]'::jsonb,
  status        text    NOT NULL DEFAULT 'processing',
  empresa_id    uuid    REFERENCES empresas(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auditoria_reavaliacao_lote ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.auditoria_reavaliacao_lote IS
'Lote de reavaliação da Sem 14 em background (Trigger.dev). Service-role only (RLS sem policy). status: processing | done.';
