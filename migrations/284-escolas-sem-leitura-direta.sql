-- 284: `escolas` deixa de ser legível direto pelo navegador (PostgREST).
--
-- Achado da análise de segurança de 10/10/2026. A policy `escolas_select_same_tenant`
-- (mig 129, de 02/06) liberava a leitura por TENANT: `current_empresa_id()` resolve a
-- empresa pelo e-mail do JWT, então qualquer colaborador logado lia, com a chave anon
-- pública, as escolas e unidades da própria empresa (nome, PPP, origem das áreas). Sem
-- dado pessoal, mas é a mesma classe que a mig 279 fechou em `colaboradores`, e o
-- INV7 do `rls-posture` só olhava as quatro tabelas daquela migration.
--
-- Medido no código de produção (76e3466d): o navegador só lê `sessoes_avaliacao` e
-- `mensagens_chat`. Toda leitura de `escolas` (actions/escolas.ts, actions/fase1.ts,
-- app/api/chat, assessment-actions, reset da demo) roda no servidor com service_role,
-- que não passa por RLS. A tabela segue com RLS ligada e sem policy: nega tudo a
-- anon e authenticated.
--
-- Idempotente.

DROP POLICY IF EXISTS escolas_select_same_tenant ON public.escolas;

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar; devolve a leitura do tenant inteiro a qualquer colaborador):
-- CREATE POLICY escolas_select_same_tenant ON public.escolas
--   FOR SELECT TO authenticated
--   USING (empresa_id = public.current_empresa_id());
