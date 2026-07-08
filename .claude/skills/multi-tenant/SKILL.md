---
name: multi-tenant
description: Invariantes de isolamento multi-tenant e uso de service-role na Vertho App. Use SEMPRE que escrever/editar actions, rotas de API, ou qualquer query que toque dado de tenant (colaboradores, trilhas, respostas, etc.), ou ao adicionar uso de createSupabaseAdmin. Encodes que o app roda 100% service-role (bypassa RLS) e o isolamento depende do código, mais o guard de CI que bloqueia service-role fora da allowlist.
---

# Multi-tenant & service-role (Vertho App)

O app roda **100% em service-role** via **`createSupabaseAdmin()`** (`lib/supabase.ts`) — isso **bypassa RLS**. O isolamento entre tenants depende inteiramente do **código**, não do banco. Um erro aqui vaza dados entre empresas.

## Regras OBRIGATÓRIAS

1. **Todo acesso a dado de tenant passa por `tenantDb(empresaId)`** (`lib/tenant-db.ts`) — ele força o filtro por `empresa_id`. Não monte query de tenant com `createSupabaseAdmin` cru.

2. **Resolver colaborador SEMPRE por `findColabByEmail`** (resolve o tenant pelo header `x-tenant-slug`). **Nunca** `.eq('email', ...)` direto — um usuário em 2+ empresas quebra.

3. **Actions internas** que pulam a sessão (reset de demo, crons, auto-triggers) recebem **`internal?: { empresaId }`** e **revalidam o tenant** (defesa em profundidade). **Não** é um `boolean`.

4. **Trabalho pós-response numa rota** → **`after()`** (`next/server`). IIFE solta morre no freeze da lambda. Trabalho pesado que precisa de retry/status → task Trigger.dev + coluna de status + gate/polling (ver skill `trigger-dev`).

5. **Tenant de demo (`is_demo`) NÃO envia WhatsApp/e-mail real** — guard em `lib/demo/envio-guard`. Personas `*.demo@vertho.ai` são personas, não staff.

## ⚠️ Guard de service-role no CI (quebra o build)

Existe um teste que **falha o CI** se o uso de service-role divergir da allowlist:
`tests/unit/security/service-role-guard.test.ts` + `config/service-role-allowlist.json`.

Ao **adicionar um arquivo novo** que chama `createSupabaseAdmin(`:
- **É obrigatório** acrescentar a entrada em `config/service-role-allowlist.json` com a **contagem exata** de ocorrências de `createSupabaseAdmin(` (mesma lógica de contagem do teste). Senão o CI falha.

Regras do guard:
- Arquivo novo com `createSupabaseAdmin(` fora da allowlist → **falha**.
- Contagem aumentada num arquivo já permitido → **falha** (atualize o número).
- Entrada stale (arquivo removido do repo) → **falha** (remova a entrada).

## Proteção server-side conta; client-side NÃO

`requireAdminAction()` / `requireRoleAction()` (ou checagem equivalente no servidor) **contam** como proteção. Guard puramente client-side ou page-level **não conta** — nesse caso o uso de service-role é risco.

## NUNCA

- Query de colaborador por `.eq('email')` — use `findColabByEmail`.
- Acesso a dado de tenant sem `tenantDb(empresaId)`.
- `internal` como `boolean` — é `{ empresaId }` + revalidação.
- Trabalho pós-response sem `after()`.
- Enviar comunicação real de tenant de demo.
- Adicionar `createSupabaseAdmin(` e esquecer a allowlist.

## Fontes

- `docs/service-role-allowlist.md`, `docs/SECURITY-STATUS.md`
- `lib/supabase.ts`, `lib/tenant-db.ts`, `lib/authz.ts`, `lib/demo/envio-guard.ts`
- `config/service-role-allowlist.json` + `tests/unit/security/`
- `CLAUDE.md` § Multi-tenant
