-- 237 — primeiro acesso dos convidados dos tenants de demonstração
--
-- O acompanhamento comercial mostra as marcas de quem foi convidado para um
-- tenant demo. Para o passaporte (`demo_prospect_sessions`) o primeiro acesso
-- é carimbado pelo próprio app; para o convidado nomeado do seed e para quem
-- foi cadastrado à mão, o único registro de entrada é o `last_sign_in_at` do
-- Supabase Auth, que o PostgREST não expõe (schema `auth`).
--
-- Varrer `auth.admin.listUsers` no lugar disto custaria uma paginação sobre
-- TODOS os usuários do projeto a cada atualização do painel. Esta função lê a
-- linha por e-mail, e só devolve e-mails que pertencem a um colaborador de
-- empresa com `is_demo = true` — fora do escopo demo ela não conta nada.

CREATE OR REPLACE FUNCTION public.demo_guest_auth_activity(p_emails text[])
RETURNS TABLE (email text, last_sign_in_at timestamptz, auth_created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(u.email), u.last_sign_in_at, u.created_at
  FROM auth.users u
  WHERE lower(u.email) = ANY (SELECT lower(alvo) FROM unnest(p_emails) AS alvo)
    AND EXISTS (
      SELECT 1
      FROM public.colaboradores c
      JOIN public.empresas e ON e.id = c.empresa_id
      WHERE lower(c.email) = lower(u.email)
        AND e.is_demo IS TRUE
    );
$$;

REVOKE ALL ON FUNCTION public.demo_guest_auth_activity(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.demo_guest_auth_activity(text[]) FROM anon;
REVOKE ALL ON FUNCTION public.demo_guest_auth_activity(text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.demo_guest_auth_activity(text[]) TO service_role;

COMMENT ON FUNCTION public.demo_guest_auth_activity(text[]) IS
  'Primeiro acesso (last_sign_in_at) dos convidados de tenants is_demo, por e-mail. Só service_role executa.';

NOTIFY pgrst, 'reload schema';

-- Rollback manual:
-- DROP FUNCTION IF EXISTS public.demo_guest_auth_activity(text[]);
