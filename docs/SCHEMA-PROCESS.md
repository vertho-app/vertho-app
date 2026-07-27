# Processo de Alteração de Schema

> Revisão: 2026-07-27 — doc único de schema/migrations. Absorveu `migrations-workflow.md`, que
> ensinava o caminho **errado** (ver "O que NÃO fazer" abaixo). Antes: 2026-07-07, 2026-04-17.

## O que NÃO fazer (o doc antigo mandava fazer)

`migrations-workflow.md` descrevia um fluxo via Supabase CLI que **não é o deste projeto** e que
falha na prática. Removido para não induzir erro:

| O que ele mandava | Por que está errado aqui |
|---|---|
| `supabase migration new` / `supabase db push` | **Não existe `supabase/migrations/`** neste repo, e `db push` não é usado. As migrations são `migrations/NNN-nome.sql`, aplicadas por script |
| Aplicar via Management API com `curl` | O PAT da conta retorna **403** nesse endpoint |
| `supabase link` + `db pull` como setup obrigatório | Não há ambiente local nem staging; o CLI não faz parte do fluxo |
| MCP Supabase para aplicar DDL | O MCP é **read-only** neste projeto |

O que sobreviveu dele — padrões de escrita da migration e política de rollback — está nas seções
finais.

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

## Padrões obrigatórios de escrita (absorvidos do doc antigo)

- **`IF NOT EXISTS` / `IF EXISTS` em tudo** — idempotência não é opcional: a migration pode ser
  reaplicada.
- **`COMMENT ON COLUMN`** em coluna nova — é a única documentação que viaja junto com o schema.
- **RLS habilitada** em tabela nova (mesmo que a policy seja restritiva e o acesso real venha por
  service-role — ver `ARQUITETURA.md` §11.0 sobre o que a RLS de fato protege).
- **Índice** em FK e em coluna de filtro frequente.
- **`CASCADE` só com intenção explícita.** Já custou caro: `videos_gerados.modulo_base_id` é
  `NOT NULL + CASCADE`, então deletar um Módulo-Base cascateia os decks e os vídeos personalizados
  (F-I3 do `FMEA-PIPELINE.md`). A regra virou operacional: **não deletar MB publicado — despublicar.**

## Rollback

**Não confie em reversão automática.** O procedimento é:

1. Backup antes (point-in-time restore do Supabase cobre o caso geral).
2. Deu ruim → restaurar e reverter manualmente.
3. Deixar o SQL de rollback **comentado no fim do próprio arquivo** de migration:
   `-- Rollback: ALTER TABLE trilhas DROP COLUMN IF EXISTS nova_coluna;`

## Pendências conhecidas (herdadas, sem data)

- Ambiente de **staging** Supabase separado — hoje só existe produção.
- CI que detecte **schema drift** por PR.
- Teste de migration em banco descartável.

## Numeração

Migrations usam numeração sequencial: `NNN-nome-descritivo.sql`.
**Faixa atual: 022-183** (164 arquivos, com gaps).

Marcos recentes: 172/173 `ia_jobs` (lote em segundo plano + parada) · 174 competências-foco do cargo ·
175/176 development blueprints + auditoria · 177/178 ledger de uso de IA + função de resumo ·
179 eventos de trilha · 180 `videos_watched` por semana · 181 carimbo de pílula por canal ·
182 config de programa na trilha (Modo Personalizado) · 183 DISC contextual no pulso.

Anteriores (06-07/07/2026):

| Migration | O que faz |
|-----------|-----------|
| `166-segmento-comercio.sql` | Segmento "Comércio" (troca 'fundacao'→'comercio' em `customer_type`/`segment`) + pacote 'piloto'. Drop robusto dos CHECK antes do UPDATE, recria com os valores novos. |
| `167-proposta-bruto-desconto.sql` | `sales_proposals.contract_value_gross` + `discount_amount` (valor bruto e desconto em R$ da proposta). |
| `168-proposta-versao.sql` | `sales_proposals.version` + `supersedes_id` + status `superseded` (versionamento: revisar e reenviar proposta). |
| `169-acumulada-piloto-status.sql` | `temporada_semana_progresso.acumulada_status`/`acumulada_erro`/`acumulada_started_at` (status rastreável da acumulada do piloto na Trigger.dev, com gate no fechamento). |
