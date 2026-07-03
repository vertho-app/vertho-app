-- 157 — Segurança: search_path fixo em funções SECURITY DEFINER (#9)
--
-- Função SECURITY DEFINER sem `search_path` fixo roda com o search_path do
-- CHAMADOR: um atacante que crie um objeto (tabela/função) num schema à frente
-- de `public` no seu search_path pode fazer a função definer resolver esse
-- objeto malicioso — rodando com privilégio do dono (hijack). O padrão seguro
-- (SET search_path = public → pg_catalog fica implícito e imutável à frente)
-- já estava em current_empresa_id/current_colaborador_id/can_read_sessao_avaliacao
-- (mig 113). Faltava em 4 funções:
--
--   get_empresa_id()                    → CRÍTICA: ancora TODA policy tenant-scoped.
--   diag_qualidade_distinct_chave(...)  → diag interno.
--   diag_qualidade_municipios_distintos() → diag interno.
--   exec_sql(text)                      → fantasma (0 uso no repo; EXECUTE já
--                                         revogado na mig 155). É um executor de
--                                         SQL arbitrário — fixar search_path não
--                                         a torna segura; a remoção é o certo.

DROP FUNCTION IF EXISTS public.exec_sql(text);

ALTER FUNCTION public.get_empresa_id() SET search_path = public;
ALTER FUNCTION public.diag_qualidade_distinct_chave(text, text, integer) SET search_path = public;
ALTER FUNCTION public.diag_qualidade_municipios_distintos() SET search_path = public;
