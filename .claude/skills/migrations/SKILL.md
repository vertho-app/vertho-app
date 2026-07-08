---
name: migrations
description: Aplicar mudanças de schema no Supabase da Vertho App. Use quando o trabalho envolver arquivos em migrations/, criar/alterar tabelas/colunas/índices/RLS, ou o usuário falar em migration/banco/schema/adicionar coluna. Encodes o fluxo manual (script node+pg + DATABASE_URL), idempotência obrigatória e os anti-padrões (sem supabase db push, MCP é read-only).
---

# Migrations Supabase (Vertho App)

Migrations são arquivos `.sql` em **`migrations/NNN-nome.sql`** (numeração sequencial; a última em produção é por volta da `171` — confira o maior N em `migrations/` antes de criar). O schema canônico é o **banco em produção** — não existe `supabase/migrations/` nem baseline gerenciado por CLI.

## Como aplicar (método autoritativo)

```bash
cd "C:\GAS\Vertho App\nextjs-app"
node --env-file=.env.local scripts/apply-migration.mjs migrations/NNN-nome.sql
```

- Usa **`DATABASE_URL`** do `.env.local` (Session pooler, IPv4) via driver `pg`.
- O fluxo aplica o SQL e emite **`NOTIFY pgrst, 'reload schema'`** pro PostgREST pegar o novo schema. Se aplicar por outro método, emita o NOTIFY manualmente ou a API seguirá enxergando o schema antigo.
- **MCP Supabase é read-only** — não aplica migration.
- A **Management API (PAT) retorna 403** nesta conta — não tente `curl https://api.supabase.com/...`.

## Padrões OBRIGATÓRIOS

- **Idempotente em tudo**: `IF NOT EXISTS` / `IF EXISTS`. Reaplicar uma migration não pode dar erro.
- **`COMMENT ON COLUMN ...`** em coluna nova (documentação viva do schema).
- **RLS habilitado** em tabela nova (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).
- **Índice** em FKs e em colunas de filtro frequente.
- **Sem `CASCADE` sem pensar** — dado apagado não volta.
- Nome do arquivo segue `NNN-` sequencial; confira o maior N antes de criar.

## Rollback

**Nunca confie em migration auto-reversível.**

1. Backup antes: point-in-time restore do Supabase ou `pg_dump`.
2. Se quebrar: restaurar do backup + reverter manualmente.
3. Deixar o SQL de rollback **comentado no fim** do próprio arquivo `.sql`:
   ```sql
   -- Rollback (se precisar):
   -- ALTER TABLE trilhas DROP COLUMN IF EXISTS nova_coluna;
   ```

## NUNCA

- `supabase db push` (sem staging configurado; o fluxo canônico é o script node).
- `supabase/migrations/` (não existe neste projeto).
- Migration não-idempotente.
- Aplicar via MCP Supabase ou Management API PAT.

## Fontes

- `docs/migrations-workflow.md`, `docs/SCHEMA-PROCESS.md`
- `scripts/apply-migration.mjs`
- Memória `reference_trigger_deploy` (gotchas de deploy)
- Project ref: `xwuqrgrvakxtphbmudwj` · host `db.xwuqrgrvakxtphbmudwj.supabase.co`
