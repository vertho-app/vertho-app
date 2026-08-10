-- 206 — Fecha a leitura do acervo por qualquer sessão `authenticated`.
--
-- O QUE ESTAVA ABERTO (medido em 10/08/2026 contra produção):
--   4 policies `FOR SELECT TO authenticated` sem filtro de tenant. Duas origens
--   diferentes, conferidas arquivo por arquivo (o relatório da auditoria dizia
--   "mig 149" para as duas, e não era isso):
--     · `modulos_base_read_authenticated` nasceu global e CERTA (mig 122, quando a
--       tabela era catálogo compartilhado). Quem mudou foi a TABELA: a mig 135
--       adicionou `empresa_id` e ninguém revisitou a policy. A mig 149 só acrescentou
--       `competencia_id` — não é a culpada.
--     · `mc_authenticated_read` (`000-baseline.sql:2390`) e as duas de `competencias`
--       (mig 037) nasceram permissivas sobre tabela que JÁ tinha `empresa_id`.
--   A mig 156 fechou as permissivas `TO public`/`anon` e parou aí — o papel
--   `authenticated` ficou de fora dela e do INV2 do guard de postura.
--
--   Consequência: um estranho se cadastra num tenant com `sys_config.allow_open_signup`
--   (`bett`, tenant REAL, e `acme-demo`), recebe um JWT `authenticated` e faz um GET no
--   PostgREST com a anon key que está no bundle público. Voltam 235 Módulos-Base de 3
--   empresas, 393 micro-conteúdos ativos e 935 competências de 10 empresas — Macaé,
--   Ibipeba e Boehringer inclusive. É a extração dos manuscritos de cliente (~$0,197 por
--   módulo) num único GET, sem tocar em nenhuma linha do app.
--
-- POR QUE DROP, E NÃO `USING (empresa_id = get_empresa_id())`:
--   `get_empresa_id()` lê `auth.jwt()->'app_metadata'->>'empresa_id'` e NENHUM dos 365
--   registros de `auth.users` tem esse claim — nada no app o escreve. A função devolve
--   NULL para todo JWT real, e `empresa_id = NULL` é NULL: a policy negaria tudo do mesmo
--   jeito, com a aparência de estar protegendo. Trocar a permissiva por uma tenant-scoped
--   inerte seria decoração. (Se a decisão futura for popular o claim, a policy nasce nessa
--   mesma migration-família, junto do backfill — não antes.)
--
-- DENOMINADOR (grep de `from('<tabela>')` em arquivos 'use client', 10/08):
--   modulos_base_conteudo 0 · micro_conteudos 0 · competencias_base 0 ·
--   competencias 1, `app/dashboard/assessment/chat/page.tsx`, migrado para a server
--   action `getNomeCompetencia` NO MESMO COMMIT (com o tenant vindo da sessão).
--
-- `competencias_base` é catálogo nacional (24 linhas, SEM `empresa_id`) — não vaza dado
-- de cliente, mas também não tem leitor no browser. Fecha por ausência de consumidor; se
-- um dia precisar ser lida do cliente, a policy volta nomeada e com esse motivo escrito.
--
-- O REVOKE não é redundante com o DROP: RLS ligada sem policy já nega, mas o GRANT
-- sobrevive a um `DISABLE ROW LEVEL SECURITY` acidental numa migration futura. Sem o
-- GRANT, o furo precisa de dois erros para reabrir, não de um.

BEGIN;

DROP POLICY IF EXISTS modulos_base_read_authenticated ON modulos_base_conteudo;
DROP POLICY IF EXISTS mc_authenticated_read           ON micro_conteudos;
DROP POLICY IF EXISTS authenticated_select_competencias      ON competencias;
DROP POLICY IF EXISTS authenticated_select_competencias_base ON competencias_base;

REVOKE SELECT ON modulos_base_conteudo FROM anon, authenticated;
REVOKE SELECT ON micro_conteudos       FROM anon, authenticated;
REVOKE SELECT ON competencias          FROM anon, authenticated;
REVOKE SELECT ON competencias_base     FROM anon, authenticated;

COMMIT;
