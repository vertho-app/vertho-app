-- 037: Habilita RLS nas 5 tabelas alertadas pelo Supabase (13/04/2026).
-- Service role sempre bypassa RLS, então actions server-side seguem funcionando.
-- Browser/anon: bloqueado exceto onde há policy explícita.

-- ── competencias (régua + descritores da empresa) ──
-- Usada pelo browser em app/dashboard/assessment/chat/page.js.
-- Policy: authenticated pode ler tudo. Confidencialidade entre empresas é
-- baixa (competências são descritivas). Escrita só via service role.
ALTER TABLE competencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_select_competencias" ON competencias;
CREATE POLICY "authenticated_select_competencias" ON competencias
  FOR SELECT TO authenticated USING (true);

-- ── competencias_base (catálogo nacional, referência) ──
ALTER TABLE competencias_base ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_select_competencias_base" ON competencias_base;
CREATE POLICY "authenticated_select_competencias_base" ON competencias_base
  FOR SELECT TO authenticated USING (true);

-- ── platform_admins (SENSÍVEL — lista de admins Vertho) ──
-- Nenhum código browser lê essa tabela; só server-side via lib/authz.js.
-- RLS on sem policies = bloqueio total para anon/authenticated,
-- service role bypassa.
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- ── reavaliacao_sessoes (legado fase5 — só server) ──
ALTER TABLE reavaliacao_sessoes ENABLE ROW LEVEL SECURITY;

-- ── videos_watched (tracking de bunny — só server via actions/webhook) ──
ALTER TABLE videos_watched ENABLE ROW LEVEL SECURITY;
