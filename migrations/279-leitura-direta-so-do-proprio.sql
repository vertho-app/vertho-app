-- 279: a leitura direta (PostgREST) de um colaborador logado vale só para o que é DELE.
--
-- Achado da análise de segurança de 05/10/2026, na segunda passada, depois da mig 278.
-- As policies `*_select_same_tenant` (mig 113) liberavam a leitura por TENANT, não por
-- pessoa. Simulado como `authenticated`, com a chave anon pública e o JWT de UM
-- colaborador comum (role = colaborador): ele lia 300 colegas da empresa pela
-- API REST (279 com telefone, 178 com perfil DISC, 116 com texto de relatório). O
-- isolamento ENTRE empresas se mantinha (1 tenant visível), mas a regra do app, em que o
-- colaborador vê só a si e o gestor vê os liderados, não vale por esse caminho.
--
-- Medido no código de produção: o navegador só lê duas tabelas, `sessoes_avaliacao` e
-- `mensagens_chat`, e as duas leituras já são da própria pessoa (`colaborador_id = c.id`).
-- Nada lê `colaboradores` nem `empresas` direto, e o servidor usa service_role.
--
--  · colaboradores: a leitura do tenant inteiro sai; fica a da própria linha (a policy
--    `kb_tenant_isolation` consulta a linha do usuário numa subconsulta sob RLS, e a
--    própria linha basta para ela).
--  · sessoes_avaliacao e mensagens_chat: só as sessões da própria pessoa e as mensagens
--    delas. Hoje as duas tabelas têm 0 linhas, então a mudança é preventiva.
--  · empresas: a leitura da própria empresa sai. `sys_config.ai` tem os campos
--    `anthropic_key`, `gemini_key` e `openai_key` (hoje vazios, só numa empresa), e
--    qualquer colaborador do tenant leria uma chave que alguém preenchesse.
--
-- Idempotente.

DROP POLICY IF EXISTS colaboradores_select_same_tenant ON public.colaboradores;
DROP POLICY IF EXISTS colaboradores_select_self ON public.colaboradores;
CREATE POLICY colaboradores_select_self ON public.colaboradores
  FOR SELECT TO authenticated
  USING (id = public.current_colaborador_id());

DROP POLICY IF EXISTS sessoes_avaliacao_select_same_tenant ON public.sessoes_avaliacao;
DROP POLICY IF EXISTS sessoes_avaliacao_select_self ON public.sessoes_avaliacao;
CREATE POLICY sessoes_avaliacao_select_self ON public.sessoes_avaliacao
  FOR SELECT TO authenticated
  USING (colaborador_id = public.current_colaborador_id());

CREATE OR REPLACE FUNCTION public.can_read_sessao_avaliacao(sessao uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sessoes_avaliacao s
    WHERE s.id = sessao
      AND s.colaborador_id = public.current_colaborador_id()
  )
$$;

DROP POLICY IF EXISTS empresas_select_same_tenant ON public.empresas;

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar; devolve a leitura do tenant inteiro a qualquer colaborador):
-- DROP POLICY IF EXISTS colaboradores_select_self ON public.colaboradores;
-- CREATE POLICY colaboradores_select_same_tenant ON public.colaboradores
--   FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id());
-- DROP POLICY IF EXISTS sessoes_avaliacao_select_self ON public.sessoes_avaliacao;
-- CREATE POLICY sessoes_avaliacao_select_same_tenant ON public.sessoes_avaliacao
--   FOR SELECT TO authenticated USING (empresa_id = public.current_empresa_id());
-- CREATE OR REPLACE FUNCTION public.can_read_sessao_avaliacao(sessao uuid) RETURNS boolean
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
--   SELECT EXISTS (SELECT 1 FROM public.sessoes_avaliacao s
--                  WHERE s.id = sessao AND s.empresa_id = public.current_empresa_id()) $f$;
-- CREATE POLICY empresas_select_same_tenant ON public.empresas
--   FOR SELECT TO authenticated USING (id = public.current_empresa_id());
