-- 156 — Segurança: fecha as RLS "always true" que expõem dados a anon
--
-- CONTEXTO (auditoria 03/07, verificado): dezenas de tabelas tinham policy
-- permissiva `FOR ALL TO public USING (true)` (nomes admin_full_* / *_permissive
-- / *_perm). Como `anon` tem GRANT de tabela e a policy vence sempre, a chave
-- ANÔNIMA do browser lia (e em várias, escrevia) tudo cross-tenant SEM login:
--   GET  /rest/v1/respostas?select=*     → todas as empresas
--   POST /rest/v1/radarempresas_listas   → escrita anônima (WITH CHECK true)
--
-- POR QUE É SEGURO DROPAR:
--   • Todo acesso server-side do app é service_role (tenantDb e
--     createSupabaseAdmin usam a service key), que IGNORA RLS. Dropar policy
--     não afeta nenhuma rota/action.
--   • Leituras client-side (browser anon/authenticated) verificadas: só
--     sessoes_avaliacao e mensagens_chat (ambas JÁ têm policy tenant-scoped que
--     permanece) e cargos_empresa (movida para server action no mesmo PR).
--
-- CATEGORIAS:
--   A) tabelas de tenant  → dropa só a permissiva `USING(true)`; policies
--                           tenant-scoped (qual != 'true') permanecem.
--   B) radarempresas_*    → módulo interno server-only; remove TODA permissiva
--                           → sem policy + RLS on = service_role-only.
--   C) diag_* (censo)     → NÃO TOCAR: leitura pública intencional do Radar,
--                           já é FOR SELECT sem escrita anônima.

-- ── Categoria A: tabelas de tenant ──────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND qual = 'true'
      AND tablename = ANY (ARRAY[
        'respostas','sessoes_avaliacao','mensagens_chat','fit_resultados',
        'evolucao','evolucao_descritores','trilhas','relatorios','banco_cenarios',
        'cargos_empresa','cobertura_conteudo','envios_diagnostico','top10_cargos',
        'votacao_competencias','admin_audit_log','catalogo_enriquecido',
        'moodle_catalogo'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ── Categoria B: radarempresas_* (interno, server-only → service_role) ───────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND qual = 'true'
      AND tablename LIKE 'radarempresas\_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Categoria C (diag_* censo): intencionalmente sem alteração.
