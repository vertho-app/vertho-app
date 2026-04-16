# migrations-legacy

Migrations legadas do Supabase (001-036) aplicadas no banco de produção **antes** da consolidação dos repos (2026-04-16).

**IMPORTANTE**: NÃO rode estas novamente — já estão aplicadas. Servem apenas como referência histórica.

As migrations novas da aplicação ficam em `migrations/` (pasta irmã) e seguem numeração independente (022-039+).

## Por que existem duas pastas

Antes da consolidação havia 2 repos git aninhados:
- `.git` raiz com `supabase/migrations/001-036` (Supabase CLI pattern, `NNN_nome.sql`)
- `nextjs-app/.git` com `migrations/022-039` (aplicação, `NNN-nome.sql` com hífen)

Ambas foram aplicadas manualmente via Supabase Management API. Como as numerações colidem mas os nomes são diferentes, consolidamos mantendo as duas pastas separadas em vez de renumerar.

## Schema final no banco

Para reconstruir do zero o schema atual, seria preciso executar as duas pastas em ordem temporal (aproximada):
1. `migrations-legacy/001_*` a `021_*`
2. `migrations/022-*` a `033-*`
3. `migrations-legacy/022_*` a `036_*`
4. `migrations/034-*` a `039-*`

Recomendação: usar `pg_dump` como baseline se precisar reproduzir o schema.
