# Processo de Alteração de Schema

> Revisão: 2026-07-07 (receita de aplicação + faixa 022-169). Antes: 2026-04-17

## Regra principal

Toda alteração de schema **deve** ter uma migration versionada em `migrations/`.
Alterações via Dashboard Supabase são aceitáveis para prototipação rápida, mas
**devem ser convertidas em migration antes de considerar a feature concluída**.

## Checklist para alteração de schema

1. [ ] Nova coluna/tabela tem migration em `migrations/NNN-nome.sql`
2. [ ] Migration usa `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` (idempotente)
3. [ ] Contagem de migrations em `ARQUITETURA.md` está atualizada
4. [ ] Código que lê/escreve a coluna está consistente com o tipo/nullability da migration
5. [ ] Se a tabela tem RLS, a migration inclui policy (mesmo que permissiva)
6. [ ] Se a alteração foi feita primeiro no Dashboard, a migration foi criada antes do merge

## Checklist para reconciliação

Quando o banco de produção divergir das migrations rastreadas:

1. [ ] Documentar a divergência encontrada (o que existe em prod vs o que as migrations definem)
2. [ ] Criar migration de reconciliação idempotente (não destrutiva)
3. [ ] Atualizar `ARQUITETURA.md` seção de modelagem
4. [ ] Se a divergência não puder ser corrigida com segurança, documentar explicitamente

## Como aplicar uma migration em produção

O **MCP Supabase é read-only** neste projeto (`apply_migration` não grava). A aplicação
real é feita por um script Node com o driver `pg`, lendo a `DATABASE_URL` do `.env.local`:

1. Escreva a migration idempotente em `migrations/NNN-nome.sql` (ver checklist acima).
2. Rode um script Node que conecta via `pg` (`DATABASE_URL` do `.env.local`), executa o
   SQL do arquivo e, ao final, emite `NOTIFY pgrst, 'reload schema'` para o PostgREST
   recarregar o cache de schema (senão a coluna nova não aparece na API REST).
3. Confirme o resultado (coluna/constraint) antes de dar a feature por concluída.

Migrations com `CHECK`/enum: dropar o constraint **antes** do `UPDATE` de dados (via
`pg_constraint` pelo nome real, não hardcoded), migrar os dados e **recriar** o constraint
já com os valores novos — senão o `UPDATE` viola o CHECK antigo. Ver `166-segmento-comercio.sql`
e `168-proposta-versao.sql` como referência.

## Como verificar drift

```bash
# Contar migrations rastreadas
ls migrations/*.sql | wc -l

# Verificar se número bate com ARQUITETURA.md
grep "migrations" ARQUITETURA.md | head -5

# Verificar se código referencia tabela sem migration
# (buscar .from('nome_tabela') e checar se migrations/ define essa tabela)
grep -r "from('TABELA')" actions/ app/ lib/ --include="*.ts" | head
grep -l "TABELA" migrations/*.sql
```

## Divergências conhecidas e aceitas

| Tabela | Divergência | Status | Motivo |
|--------|------------|--------|--------|
| `respostas` | `colaborador_id` nullable em prod, NOT NULL na migration 029 | Aceita | Rows legados do GAS sem colaborador_id |
| `respostas` | FK `cenario_id` removida manualmente em prod | Aceita | Evitar conflito com rows órfãos |
| `banco_cenarios` | Índices duplicados (`idx_banco_cenarios_empresa` + `idx_cenarios_empresa`) | Aceita | Sem impacto funcional, risco de remoção |

## Tabelas sem migration (pré-existentes em prod)

Tabelas criadas via Dashboard antes do sistema de migrations e agora formalizadas:

| Tabela | Migration de formalização | Notas |
|--------|--------------------------|-------|
| `relatorios` | 048 | Schema inferido do código |
| `capacitacao` | 049 | Código trata ausência com try/catch |

## Numeração

Migrations usam numeração sequencial: `NNN-nome-descritivo.sql`.
Faixa atual: 022-169.

Últimas desta sessão (06-07/07/2026):

| Migration | O que faz |
|-----------|-----------|
| `166-segmento-comercio.sql` | Segmento "Comércio" (troca 'fundacao'→'comercio' em `customer_type`/`segment`) + pacote 'piloto'. Drop robusto dos CHECK antes do UPDATE, recria com os valores novos. |
| `167-proposta-bruto-desconto.sql` | `sales_proposals.contract_value_gross` + `discount_amount` (valor bruto e desconto em R$ da proposta). |
| `168-proposta-versao.sql` | `sales_proposals.version` + `supersedes_id` + status `superseded` (versionamento: revisar e reenviar proposta). |
| `169-acumulada-piloto-status.sql` | `temporada_semana_progresso.acumulada_status`/`acumulada_erro`/`acumulada_started_at` (status rastreável da acumulada do piloto na Trigger.dev, com gate no fechamento). |
