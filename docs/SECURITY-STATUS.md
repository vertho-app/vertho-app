# Estado atual de seguranca — Vertho Mentor IA

> Ultima revisao: 2026-04-17

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

### Validacao de outputs IA (P1)
- Funcoes de validacao de output em prompts criticos: `validateEvolutionScenarioScore`, `validateAvaliacaoAcumulada`, `validateEvolutionExtract`, `validateEvolutionScenarioCheck`, `validateAvaliacaoAcumuladaCheck`, `parseDesafioResponse`, `parseCenarioResponse`, `parseMissaoResponse`. Prompts de fases 1-5, conteudos e relatorios usam `extractJSON` generico sem validacao estrutural
- Parsing JSON estruturado com limpeza de backticks antes de `JSON.parse`
- Clamping de valores numericos: notas 1-4, confianca 0-1
- Validacao de enums para vocabularios controlados (`forca_evidencia`, `tendencia`, `convergencia`, etc.)

### Seguranca de prompts IA (P1)
- Regras anti-alucinacao em todos os prompts conversacionais (IA nao inventa dados do colab)
- Regras anti-inflacao em prompts de avaliacao (sem 13, acumulada, sem 14)
- Grounding RAG disciplinado com regras explicitas de uso do contexto recuperado
- Mascaramento de PII aplicado nos fluxos de chat (reflection, evaluation, tira-duvidas) e relatorios (gestor, acumulada, sem14 scorer). Nao auditado exaustivamente em todas as chamadas IA — fluxos batch (fase1, fase5, conteudos, simuladores) nao passam por PII masking

### CI guard (P2)
- `config/service-role-allowlist.json`: 88 arquivos com contagem
- Testes vitest bloqueiam:
  - Arquivo novo com createSupabaseAdmin fora da allowlist
  - Contagem aumentada em arquivo ja permitido
  - Entrada stale (arquivo removido)
- Integrado ao GitHub Actions (`typecheck.yml`)

## Divida consciente

### Codigo legado removido
- `gas-antigo/` removido (69 arquivos de codigo GAS legado)
- `migrations-legacy/` removido (37 arquivos SQL de migracoes antigas)
- Script npm `migrate:legacy` removido

### service_role (88 arquivos de codigo + 10 arquivos de teste)
- **34** usos aceitaveis (infra, jobs, webhooks, admin protegido)
- **29** candidatos a migracao para user-scoped (quando RLS estiver pronta)
- **~17** complexos demais pra migrar sem RLS policies completas + testes
- 8 stubs de API sem auth removidos (sprint 2026-04-17)
- Inventario completo: `docs/service-role-allowlist.md` + `config/service-role-allowlist.json`

### Stubs API removidos (sprint 2026-04-17)
- `api/relatorios/route.ts`, `api/pdi/route.ts`, `api/ppp/route.ts`, `api/cargos/route.ts`, `api/academia/route.ts`, `api/generate-narratives/route.ts`, `api/relatorios/individual/route.ts`, `api/webhooks/qstash/route.ts`
- Todos retornavam `{status:'ok'}` sem nenhuma autenticacao — risco de superficie de ataque

### registrarEvidencia corrigido (sprint 2026-04-17)
- Antes: aceitava `colaboradorId` e `empresaId` como parametros do client sem validacao
- Depois: recebe `email`, resolve via `findColabByEmail()` (ownership server-side)

### RLS
- Habilitada em varias tabelas mas com policies permissivas (`USING (true)`)
- Todas as queries usam `createSupabaseAdmin()` (service_role) que bypassa RLS
- RLS real requer: policies corretas + migracao pra client user-scoped + testes por tabela
- Status: **nao implementada como defense-in-depth real**

### Schema
- `respostas`: 46 colunas em producao, reconciliadas via migration 044
- `banco_cenarios`: reconciliado via migration 045 (incl. p1..p4 que nunca tinham sido aplicados)
- `relatorios`: formalizado via migration 048 (existia sem migration rastreada)
- `capacitacao`: formalizado via migration 049 (codigo tratava ausencia com try/catch)
- Divergencias conhecidas e aceitas: colaborador_id nullable, FKs ausentes, indice duplicado
- Processo anti-drift: `docs/SCHEMA-PROCESS.md`
- Total: 30 migrations (022-051)

### Cobertura de testes
- **120 testes vitest** (16 arquivos)
- Mix de comportamental (handlers reais mockados) e estrutural (presenca de guards no codigo)
- Testes comportamentais: ~20 (rotas + actions)
- Testes estruturais: ~85 (string matching — complementares, nao substituem comportamental)
- Guard de service_role: 3 testes (allowlist + stale + contagem)
- **Testes de isolamento cross-tenant**: 9 cenarios (tenant A nao acessa B, acesso legitimo permitido, colab access)

## O que NAO esta coberto
- RLS real no banco (policies sao permissivas)
- Rate limiting distribuido (so por Lambda instance)
- CSRF em server actions (Next.js tem protecao built-in mas nao auditamos)
- Testes E2E de isolamento real (requer 2 tenants em test env)
- Auditoria parcial das actions server-side — as prioritarias (relatorios, evaluation, reflection, fit) foram hardened com auth + tenant check; demais actions usam guards basicos
