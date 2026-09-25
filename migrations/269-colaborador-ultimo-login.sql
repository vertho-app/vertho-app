-- 269 — último login de um colaborador, para o Beto do WhatsApp
--
-- Em 25/09/2026 uma professora entrou com o link de acesso das 08:55, tocou no
-- mesmo botão mais quatro vezes (cada toque recusado: o link é de uso único) e
-- escreveu "não estou conseguindo acessar o link". O Beto mandou outro link sem
-- explicar nada, porque não sabia que ela já tinha entrado. O único registro de
-- entrada é o `last_sign_in_at` do Supabase Auth, que o PostgREST não expõe
-- (schema `auth`).
--
-- A função lê a linha pelo e-mail do colaborador e confere o tenant: devolve
-- NULL para colaborador de outra empresa, sem distinguir de "nunca entrou".
-- Varrer `auth.admin.listUsers` a cada mensagem do WhatsApp paginaria todos os
-- usuários do projeto. Mesmo desenho da `demo_guest_auth_activity` (mig 237).

CREATE OR REPLACE FUNCTION public.colaborador_ultimo_login(p_empresa_id uuid, p_colaborador_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT max(u.last_sign_in_at)
  FROM public.colaboradores c
  JOIN auth.users u ON lower(u.email) = lower(c.email)
  WHERE c.id = p_colaborador_id
    AND c.empresa_id = p_empresa_id
    AND c.email IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.colaborador_ultimo_login(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.colaborador_ultimo_login(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.colaborador_ultimo_login(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.colaborador_ultimo_login(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.colaborador_ultimo_login(uuid, uuid) IS
  'Último login (auth.users.last_sign_in_at) de um colaborador, conferindo o tenant. Só service_role executa. Usada pelo Beto do WhatsApp.';

NOTIFY pgrst, 'reload schema';

-- Rollback manual:
-- DROP FUNCTION IF EXISTS public.colaborador_ultimo_login(uuid, uuid);
