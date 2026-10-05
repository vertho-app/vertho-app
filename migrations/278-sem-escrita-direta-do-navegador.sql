-- 278: o navegador (anon e authenticated) não escreve em tabela nenhuma de public.
--
-- Achado da análise de segurança de 05/10/2026 (🔴 crítico):
--   `authenticated` tinha UPDATE em TODAS as colunas de `colaboradores` e a policy
--   `colaboradores_update_self` (USING/WITH CHECK `id = current_colaborador_id()`)
--   só amarra a LINHA, nunca a COLUNA. Qualquer um dos usuários com login podia
--   chamar `PATCH /rest/v1/colaboradores?id=eq.<o próprio id>` com a chave anon
--   (pública, no bundle) e gravar `role='rh'` ou `empresa_id=<outro tenant>`. O
--   servidor lê `role` e `empresa_id` DESSA linha para decidir quem a pessoa é.
--   O guard `rls-policy-estatica-guard` achou a policy "mais estreita que o
--   tenant" e a absolveu: ele mede escopo de LINHA e não vê coluna.
--
-- Por que revogar em TODAS as tabelas e não só em `colaboradores`:
--   medido no código de produção (58a9711c), o navegador só LÊ 2 tabelas
--   (`sessoes_avaliacao`, `mensagens_chat`) e não grava em nenhuma; o servidor
--   usa service_role para dado e o cliente de sessão só para `auth.*`. Ou seja,
--   nenhum caminho legítimo escreve como anon/authenticated, e o GRANT de
--   escrita que o Supabase concede por padrão era só superfície. SELECT fica
--   como está (as 2 leituras do navegador e as policies de leitura dependem).
--
-- Idempotente: REVOKE de privilégio que não existe não dá erro.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Tabela nova (criada por esta role) nasce sem o GRANT de escrita.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;

-- A policy fica inerte sem o GRANT; sai também para não voltar junto com um
-- GRANT descuidado no futuro.
DROP POLICY IF EXISTS colaboradores_update_self ON public.colaboradores;

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar; reabre a escalada de privilégio, então só com motivo):
-- GRANT INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO anon, authenticated;
-- CREATE POLICY colaboradores_update_self ON public.colaboradores
--   FOR UPDATE TO authenticated
--   USING (id = public.current_colaborador_id())
--   WITH CHECK (id = public.current_colaborador_id());
