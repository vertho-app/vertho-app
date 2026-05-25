-- 113: Fecha alerta Supabase "Table publicly accessible".
--
-- Objetivo:
--   - Habilitar RLS em tabelas sensiveis que podem existir sem RLS no schema
--     legado/baseline.
--   - Manter as leituras client-side autenticadas usadas pelo dashboard.
--   - Deixar tabelas exclusivamente server-side sem policy: anon/authenticated
--     bloqueados; service_role continua fazendo bypass.
--
-- Observacao: as funcoes SECURITY DEFINER evitam recursao em policies da
-- propria tabela colaboradores.

CREATE OR REPLACE FUNCTION public.current_colaborador_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.colaboradores c
  WHERE lower(c.email) = lower(auth.email())
  ORDER BY c.created_at DESC NULLS LAST
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.empresa_id
  FROM public.colaboradores c
  WHERE lower(c.email) = lower(auth.email())
  ORDER BY c.created_at DESC NULLS LAST
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_read_sessao_avaliacao(sessao uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sessoes_avaliacao s
    WHERE s.id = sessao
      AND s.empresa_id = public.current_empresa_id()
  )
$$;

REVOKE ALL ON FUNCTION public.current_colaborador_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_empresa_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_sessao_avaliacao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_colaborador_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_empresa_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_sessao_avaliacao(uuid) TO authenticated;

-- Tabelas com leitura direta do browser autenticado.
ALTER TABLE IF EXISTS public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sessoes_avaliacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mensagens_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS empresas_select_same_tenant ON public.empresas;
CREATE POLICY empresas_select_same_tenant ON public.empresas
  FOR SELECT TO authenticated
  USING (id = public.current_empresa_id());

DROP POLICY IF EXISTS colaboradores_select_same_tenant ON public.colaboradores;
CREATE POLICY colaboradores_select_same_tenant ON public.colaboradores
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS colaboradores_update_self ON public.colaboradores;
CREATE POLICY colaboradores_update_self ON public.colaboradores
  FOR UPDATE TO authenticated
  USING (id = public.current_colaborador_id())
  WITH CHECK (id = public.current_colaborador_id());

DROP POLICY IF EXISTS sessoes_avaliacao_select_same_tenant ON public.sessoes_avaliacao;
CREATE POLICY sessoes_avaliacao_select_same_tenant ON public.sessoes_avaliacao
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS mensagens_chat_select_same_tenant ON public.mensagens_chat;
CREATE POLICY mensagens_chat_select_same_tenant ON public.mensagens_chat
  FOR SELECT TO authenticated
  USING (public.can_read_sessao_avaliacao(sessao_id));

-- Tabelas sensiveis de uso server-side/legado. Sem policy = bloqueio para
-- anon/authenticated; service_role segue operacional.
DO $$
DECLARE
  table_name text;
  tables_to_lock text[] := ARRAY[
    'colab_otp',
    'tutor_log',
    'platform_admins',
    'reavaliacao_sessoes',
    'videos_watched',
    'ia_usage_log',
    'checkpoints_gestor',
    'fase4_progresso',
    'temporada_semana_progresso',
    'envios_diagnostico',
    'trash'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables_to_lock LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    END IF;
  END LOOP;
END $$;

-- Cinto e suspensorio: qualquer tabela public ainda sem RLS tambem e fechada.
-- Se alguma delas precisar de leitura anonima, crie uma policy explicita e
-- documentada em uma migration posterior.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass
          AND d.objid = c.oid
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- Verificacao: deve retornar zero linhas.
SELECT c.relname AS public_table_without_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND NOT c.relrowsecurity
ORDER BY c.relname;
