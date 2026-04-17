# Processo de Alteração de Schema

> Revisão: 2026-04-17

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
Faixa atual: 022-049 (28 migrations).
