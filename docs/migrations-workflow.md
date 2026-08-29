# Fluxo de Migrations Supabase

## Estado atual

Migrations são arquivos `.sql` em `migrations/` (novas) e `migrations-legacy/` (legado 001-036).

Aplicadas **manualmente** via Supabase Management API (ver `lib/supabase-admin.js` e scripts em `scripts/`). Schema real em `xwuqrgrvakxtphbmudwj.supabase.co`.

## Problema que resolvemos

Antes: zero rastreabilidade entre "o que está no código" e "o que está no banco". Risco real de aplicar migration duplicada ou divergente.

Agora: `supabase/config.toml` + CLI pra gerenciar, docs formais de fluxo.

## Setup local (uma vez por dev)

```bash
# Instalar CLI (npm ou brew)
npm install -g supabase

# Login
supabase login

# Link ao projeto remoto
supabase link --project-ref xwuqrgrvakxtphbmudwj

# Baixa schema atual como baseline
supabase db pull --schema public
```

## Workflow de nova migration

### 1. Criar migration localmente

```bash
# Supabase CLI gera arquivo com timestamp
supabase migration new nome_da_mudanca
# → cria migrations/YYYYMMDDHHMMSS_nome_da_mudanca.sql
```

Ou manual (padrão atual): `migrations/NNN-nome.sql`.

### 2. Escrever DDL

```sql
-- Idempotente! Sempre IF NOT EXISTS / IF EXISTS
ALTER TABLE trilhas ADD COLUMN IF NOT EXISTS nova_coluna TEXT;
CREATE INDEX IF NOT EXISTS idx_... ON ...;
```

### 3. Rodar localmente (se tiver Docker + Supabase local)

```bash
supabase db reset   # recria DB local + aplica todas migrations
supabase db lint    # valida SQL
```

Hoje não temos ambiente local — CLI funciona só como wrapper da Management API.

### 4. Rodar em staging (TODO)

Quando criarmos ambiente de staging:

```bash
supabase link --project-ref <staging-ref>
supabase db push
```

### 5. Aplicar em produção

**Hoje** (manual via script):

```bash
cd nextjs-app
set -a && source .env.local && set +a
SQL=$(cat migrations/NNN-nome.sql | python -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))")
curl -sS -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: curl/8.0" \
  --data-binary "$SQL"
```

**Futuro** (via CLI quando tiver staging):

```bash
supabase link --project-ref xwuqrgrvakxtphbmudwj  # produção
supabase db push
```

## Rollback

**Nunca confie em migrations auto-reversíveis.** Sempre:

1. Backup antes: `supabase db dump` ou point-in-time restore do Supabase.
2. Se der ruim: restaurar do backup + manualmente reverter a migration.
3. Documentar em `migrations/NNN-nome.sql` o SQL de rollback no fim, comentado:

```sql
-- Rollback (se precisar):
-- ALTER TABLE trilhas DROP COLUMN IF EXISTS nova_coluna;
```

## Padrões obrigatórios

- **IF NOT EXISTS / IF EXISTS** em tudo (idempotência)
- **Comments** em colunas novas: `COMMENT ON COLUMN ... IS '...'`
- **RLS** sempre habilitado em tabelas novas
- **Índice** em FKs e colunas de filtro frequente
- **Sem `CASCADE` sem pensar** — dados perdidos não voltam

## Baseline

Como temos 54 migrations aplicadas sem tooling, o "baseline" é o schema atual em produção. Pra reconstruir:

```bash
# Método 1: pg_dump completo
pg_dump -h db.xwuqrgrvakxtphbmudwj.supabase.co -U postgres > schema-baseline.sql

# Método 2: supabase CLI
supabase db pull > schema-baseline.sql
```

## TODO

- [ ] Criar ambiente de **staging** Supabase separado
- [ ] CI que roda `supabase db diff` em cada PR pra detectar schema drift
- [ ] Migration testing: subir DB local com Docker + rodar smoke tests
