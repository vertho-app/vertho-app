# AGENTS.md

## Deploy

- **Sempre faça deploy após ajustes/correções**: commit + push no `master` dispara o deploy automático da Vercel (projeto `vertho-app`). O app em uso é o de produção — correção local que não sobe não resolve o problema do usuário.
- Commite apenas os arquivos da correção (a working tree costuma ter mudanças paralelas do usuário que não devem entrar no commit).
- Antes de commitar, rodar `npm run typecheck` (`tsc --noEmit`).

## Banco de dados (Supabase)

- Projeto remoto: `xwuqrgrvakxtphbmudwj` (produção — não há ambiente local).
- Credenciais em `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- Scripts pontuais de diagnóstico/manutenção: `scripts/_*.mjs` (convenção do repo), usando `@supabase/supabase-js` + `dotenv`.
- Antes de deletar dados em produção, sempre salvar backup JSON em `backups/`.
