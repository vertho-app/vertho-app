# Estado atual de seguranca — Vertho Mentor IA

> Ultima revisao: 2026-04-16

## Camadas de protecao implementadas

### Auth server-side (P0/P1)
- API routes: `requireUser`, `requireRole`, `requireAdmin` via `lib/auth/request-context.ts`
- Server actions admin: `requireAdminAction` via `lib/auth/action-context.ts` (cookie SSR @supabase/ssr)
- Identidade derivada 100% server-side — zero input de identidade do client

### Tenant isolation (P0/P1)
- `assertTenantAccess`: valida empresa_id contra contexto autenticado
- `assertColabAccess`: self / gestor (mesma area_depto) / RH (empresa) / admin
- `assertEmailAccess`: mesma logica via email
- Gestor sem area_depto: fail closed

### CSRF (P2)
- `lib/csrf.ts::csrfCheck` em 10 rotas mutativas
- Bearer explicito: bypass (nao cookie-vulnerable)
- Safe methods (GET/HEAD/OPTIONS): bypass
- Cookie-based: exige Origin confiavel (*.vertho.com.br, *.vercel.app, localhost)
- Fail closed com 403

### Rate limiting (P2)
- `lib/rate-limit.ts`: in-memory sliding window por Lambda instance
- aiLimiter (10/min) em 6 rotas IA
- heavyLimiter (5/min) em 1 rota upload
- Nao distribuido — baseline defense-in-depth

### CI guard (P2)
- `config/service-role-allowlist.json`: 88 arquivos com contagem
- Testes vitest bloqueiam:
  - Arquivo novo com createSupabaseAdmin fora da allowlist
  - Contagem aumentada em arquivo ja permitido
  - Entrada stale (arquivo removido)
- Integrado ao GitHub Actions (`typecheck.yml`)

## Divida consciente

### service_role (88 arquivos)
- **34** usos aceitaveis (infra, jobs, webhooks, admin protegido)
- **29** candidatos a migracao para user-scoped (quando RLS estiver pronta)
- **25** complexos demais pra migrar sem RLS policies completas + testes
- Inventario completo: `docs/service-role-allowlist.md` + `config/service-role-allowlist.json`

### RLS
- Habilitada em varias tabelas mas com policies permissivas (`USING (true)`)
- Todas as queries usam `createSupabaseAdmin()` (service_role) que bypassa RLS
- RLS real requer: policies corretas + migracao pra client user-scoped + testes por tabela
- Status: **nao implementada como defense-in-depth real**

### Schema
- `respostas`: 46 colunas em producao, reconciliadas via migration 044
- `banco_cenarios`: reconciliado via migration 045 (incl. p1..p4 que nunca tinham sido aplicados)
- Divergencias documentadas: colaborador_id nullable, FKs ausentes, indice duplicado
- Detalhes: migrations 044/045 + notas inline

### Cobertura de testes
- **111 testes vitest** (15 arquivos)
- Mix de comportamental (handlers reais mockados) e estrutural (presenca de guards no codigo)
- Testes comportamentais: ~20 (rotas + actions)
- Testes estruturais: ~85 (string matching — complementares, nao substituem comportamental)
- Guard de service_role: 3 testes (allowlist + stale + contagem)

## O que NAO esta coberto
- RLS real no banco (policies sao permissivas)
- Rate limiting distribuido (so por Lambda instance)
- CSRF em server actions (Next.js tem protecao built-in mas nao auditamos)
- Testes E2E de isolamento real (requer 2 tenants em test env)
- Auditoria de todas as 88 actions server-side (so as prioritarias foram hardened)
