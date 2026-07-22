# Estado atual de seguranca — Vertho Mentor IA

> Ultima revisao: 2026-07-22 — **os 3 achados altos de 17/07 estao FECHADOS** (ver "Fechamento dos altos 22/07" abaixo).
> Antes: 2026-07-17 (auditoria geral — detalhes em `docs/LEVANTAMENTO-2026-07.md` §4. **3 achados altos NOVOS**, hoje fechados: (1) `api/bunny-videos` + `api/video-download` sem auth — enumeracao + download anonimo de videos, PII potencial nos personalizados; (2) header `x-tenant-slug` forjavel no apex/vercel.app — enumeracao de e-mails cross-tenant e signup em tenant alheio; (3) open redirect de `token_hash` de sessao em `api/auth/phone-otp/verify`. Numeros corrigidos: service-role = **130 arquivos / 299 usos** (nao 91/168); residuo `internal` = **5 entradas** (nao 8; fase1/fase3 removidos 10/07). As 4 classes criticas de 03/07 seguem confirmadas fechadas.)
> Anterior: 2026-07-07 (defense-in-depth de tenant nas ações internas + filtro de contas internas demo-aware; ver seção "Endurecimento 06-07/07"). Anterior: 2026-07-03 (auditoria de segurança — RCE/RLS/IDOR/search_path/MVs fechados; ver seção "Auditoria de segurança 03/07")

## Fechamento dos altos 22/07

| Achado (17/07) | Correcao |
|---|---|
| Enumeracao + download anonimo de video | `api/bunny-videos` **removida** (rota sem nenhum caller no app — listava GUID+titulo dos 50 videos recentes da library COMPARTILHADA entre tenants, e o titulo dos personalizados carrega o primeiro nome). `api/video-download/[videoId]` passa a exigir `requirePermission(req, 'content.manage')` — o unico caller e o `/admin/conteudos`, que ja exigia essa permissao. |
| `x-tenant-slug` forjavel | `proxy.js` agora **descarta sempre** o `x-tenant-slug` que chega na request antes de decidir, e nos hosts sem tenant (apex, `*.vercel.app`) tambem remove o cookie `vertho-tenant-slug` — que ali so pode ter vindo de um cliente HTTP forjando (o cookie e host-only, o browser nao o envia pro apex). O tenant passa a ser funcao exclusiva do hostname. Guardado por `tests/unit/security/proxy-tenant-forge.test.ts` (validado por mutacao: sem a correcao, 3 dos 6 testes falham). |
| Open redirect de `token_hash` | `api/auth/phone-otp/verify` passa a usar `resolveSafeAuthRedirect` (allowlist de host, `lib/auth/redirect.ts`) — o mesmo helper das rotas irmas de auth. O `callbackUrl` carrega um token que ESTABELECE SESSAO; antes ia para dominio arbitrario escolhido pelo cliente. |

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
- Cookie-based: exige Origin confiavel (*.vertho.ai, *.vercel.app, localhost)
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
- `config/service-role-allowlist.json`: 91 arquivos com contagem (168 usos esperados)
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

### service_role (91 arquivos allowlistados — 168 usos esperados)
- Breakdown abaixo (34 + 29 + ~17 = 80) e' do snapshot de 2026-04-17; a allowlist cresceu para 91 desde entao (Pulso, RadarEmpresas, frentes recentes). Os percentuais devem se manter na mesma ordem; quando passar pela proxima auditoria, atualizar.
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
- Depois: identidade 100% server-side via `getAuthenticatedEmailFromAction()` (cookies SSR)

### Avaliacao de reducao de service_role (sprint 2026-04-17)
6 fluxos de dashboard avaliados para migracao de `createSupabaseAdmin()`:
- 4 read-only puros (content/search, capacitacao-recomendada, dashboard-actions, jornada-actions)
- 2 parciais (perfil-actions e pdi-actions precisam de storage)

**Decisao: manter service_role em todos os 6.** Motivo: sem RLS real ativa, trocar
service_role por anon key nao reduz privilegio efetivo — ambos leem todas as tabelas.
A reducao real de risco ja esta feita via:
- tenant derivado server-side (findColabByEmail / getUserContext)
- queries filtradas por empresa_id no codigo
- ownership checks antes de qualquer operacao

Prerequisito para migracao real: RLS policies por tabela + testes de enforcement

### RLS
- **Corrigido 03/07 (mig 156)**: as policies permissivas `USING(true) TO public` que davam leitura/escrita ANÔNIMA cross-tenant (respostas, mensagens_chat, fit_resultados, evolucao, sessoes_avaliacao, trilhas, admin_audit_log, radarempresas_*) foram removidas. Comprovado: `GET /rest/v1/respostas` com a anon key ia de dados → 0 linhas.
- As queries do app usam `createSupabaseAdmin()`/`tenantDb` (service_role, bypassa RLS) — o isolamento primário é na app; RLS agora é **defense-in-depth**: tabelas de tenant sem permissiva = deny-all para anon/authenticated; tabelas com leitura legítima via browser têm policy tenant-scoped (`empresa_id = get_empresa_id()`).
- `diag_*` (censo público do Radar) mantêm `SELECT public` de propósito; `radarempresas_*` → service_role-only.
- **Guard anti-regressão**: `tests/unit/security/rls-posture.test.ts` (5 invariantes de estado do banco — sem RLS-off+anon, sem policy `true`, sem exec_sql, sem MV anon-readable, search_path em toda SECURITY DEFINER).
- Follow-up: policies tenant-scoped EXPLÍCITAS nas ~60 tabelas hoje deny-by-default (fechadas, mas implícito).

### Schema
- `respostas`: 46 colunas em producao, reconciliadas via migration 044
- `banco_cenarios`: reconciliado via migration 045 (incl. p1..p4 que nunca tinham sido aplicados)
- `relatorios`: formalizado via migration 048 (existia sem migration rastreada)
- `capacitacao`: formalizado via migration 049 (codigo tratava ausencia com try/catch)
- Divergencias conhecidas e aceitas: colaborador_id nullable, FKs ausentes, indice duplicado
- Processo anti-drift: `docs/SCHEMA-PROCESS.md`
- Total na epoca desta secao (2026-04-17): 30 migrations (022-051). **Atualmente (2026-07-07): 150 (022-169, com gaps)** — ver `ARQUITETURA.md` secao 8.

### Cobertura de testes
- **297 testes vitest** (21 arquivos) + 17 specs Playwright (E2E)
- Mix de comportamental (handlers reais mockados) e estrutural (presenca de guards no codigo)
- Testes comportamentais: ~20 (rotas + actions)
- Testes estruturais: ~85 (string matching — complementares, nao substituem comportamental)
- Guard de service_role: 3 testes (allowlist + stale + contagem)
- **Testes de isolamento cross-tenant**: 9 cenarios (tenant A nao acessa B, acesso legitimo permitido, colab access)
- **Testes anti-identity-by-parameter**: 123 cenarios (22 actions + 8 pages verificadas)
- **Diagnostico E2E (Playwright, 2026-05-27)**: crawler de ~65 rotas + ~60 testes nivel 3 por pagina, todos read-only (nao clicam acoes de IA/envio/exclusao). Rodam contra o sandbox `teste-piloto` com usuario de teste efemero (criado e removido por run). Auth por sessao compartilhada (`storageState` gitignorado). Util como guarda de regressao de "pagina quebrou"; **nao** substitui os testes de isolamento cross-tenant (esses seguem em vitest). Achado nesta frente: crash da home do gestor/RH (corrigido).

### Endurecimento de dashboard actions (completo 2026-04-17)
**Primeira onda (10 actions):** loadDashboardData, loadHomeKpis, loadJornada,
loadPerfil, salvarFotoPerfil, salvarAvatarPreset, removerAvatar, loadPDI,
baixarMeuPdiPdf, registrarEvidencia.

**Segunda onda (15 functions em 6 arquivos):** listarEquipeEvolucao,
listarCheckpointsPendentes, salvarCheckpointGestor, loadLideradoConcluida,
getDiagnosticoDoDia, salvarRespostaDiagnostico, loadAssessmentData,
loadPerfilCIS, gerarInsightsExecutivos, salvarPerfilComportamental,
loadBehavioralReport, gerarEsalvarRelatorioComportamental,
baixarRelatorioComportamentalPdf, regenerarRelatorioComportamental,
loadEvolucao.

**Wrapper corrigido:** getColabByEmail (app/dashboard/colab-action.ts).

Todas derivam identidade 100% server-side via `getAuthenticatedEmailFromAction()`.
Nenhuma aceita mais email/colaboradorId/empresaId do client como identidade do caller.

### Go-live
Checklist operacional: `docs/GO-LIVE-CHECKLIST.md`

## Auditoria de segurança 03/07 — críticos fechados (verificados no banco)
Quatro vetores ATIVOS (exploráveis em prod) + achados de endurecimento, todos corrigidos:
- **RCE `public.exec_sql(text)`** (mig 155/157): função `SECURITY DEFINER` executora de SQL arbitrário, com grant default `EXECUTE TO PUBLIC` → chamável por anon via `POST /rest/v1/rpc/exec_sql`. Revogada e depois **removida** (`DROP`).
- **RLS "always true" anon cross-tenant** (mig 156): ver seção RLS acima.
- **2 server actions sem auth** (`cbaaeda`): `baixarRelatorioComportamentalPdfPorId` (IDOR — fetchColabPorId sem filtro empresa) e `pregerarPdfsEmpresa` (IDOR + abuso LLM) → gateadas com `requireAdminAction`.
- **`search_path` em SECURITY DEFINER** (mig 157): `get_empresa_id()` (ancora todo o RLS tenant-scoped) + diag_qualidade_* ganharam `SET search_path=public` (anti-hijack).
- **Materialized views anon-readable** (mig 158): `pulse_mv_aggregates` (dado de tenant!) + `diag_mv_*` tinham SELECT pra anon (MV não aceita RLS) → revogado.
- **Path-traversal** no `/api/upload/signed-url` (`formato` do body virava segmento de path) → allowlist estrita.
- **Compare de secret timing-unsafe** (`!==`) em webhooks bunny/cron/radar-lead-pdf → `lib/secure-compare.safeSecretEqual`. `modulo-from-video` passa a aceitar `INTERNAL_API_KEY` (desacopla do service-role).
- **Self-protection no platform-admins**: master não pode se rebaixar/remover (self-lockout).

## Endurecimento 06-07/07 — defense-in-depth de tenant + filtro demo-aware

- **B5 (prova de tenant nas ações internas)** (`e19acc04`): `gerarEvolutionReport` / `gerarAvaliacaoAcumulada` / `gerarAvaliacaoAcumuladaParcial` trocaram o argumento `internal: boolean` por `internal?: { empresaId }`. O caller interno (rota/Trigger com service-role, que **bypassa RLS**) agora PROVA o tenant da sessão, e a função REJEITA trilha de outro tenant (`trilha.empresa_id !== internal.empresaId` → erro), fechando um `trilhaId` forjado cross-tenant. `empresaId` null (platform admin) pula o assert. Callers de admin continuam sem 2º arg (seguem no `requireAdminAction`). `actions/evolution-report.ts:35`, `actions/avaliacao-acumulada.ts:28` e `:206`.
- **Flag `internal` tenant-scoped em fase1/fase3** (`e19acc04`): `rodarIA2` / `rodarIA3Uma` (`actions/fase1.ts:741`, `:1196`) e `rodarIA4` (`actions/fase3.ts:372`) ganharam a opção `internal` (service-role) para tooling/golden-update do acme-demo, que roda por um caminho já gated (botão admin do reset do demo).
- **Filtro de contas internas demo-aware** (`1fc29497`, `lib/internal-emails.ts`): `isInternalEmail` / `excludeInternalEmails` passaram a EXEMPTAR `*.demo@vertho.ai` — personas de demonstração são o CONTEÚDO do tenant de demo, não staff Vertho. Antes o filtro excluía TODO `@vertho.ai` de ranking/DNA/perfil org, deixando as views do tenant de demo vazias. `excludeInternalEmails` virou `.or('email.not.ilike.*@vertho.ai,email.ilike.*.demo@vertho.ai')`; novo helper `isDemoPersonaEmail`. **O guardrail de ENVIO do demo NÃO muda**: continua sendo o `is_demo` (envio-guard), não este filtro de agregação — então segue intacto. Staff (ex.: `rodrigo@vertho.ai`) permanece excluído.

## O que NAO esta coberto
- Rate limiting distribuido (so por Lambda instance — `lib/rate-limit.ts`; teto efetivo × N lambdas; migrar p/ Upstash Redis)
- `middleware.ts` global (rate-limit/CSRF centralizados; headers de segurança JÁ estão em `next.config.mjs`; falta CSP completa)
- Leaked-password protection no Supabase Auth (toggle no dashboard)
- Gate de envio central por tenant-demo (acme-demo: proteção hoje é personas @vertho.ai sem telefone)
- Policies tenant-scoped explícitas nas ~60 tabelas deny-by-default (fechadas, mas implícito)
- CSRF em server actions (Next.js tem protecao built-in mas nao auditamos)
- Testes E2E de isolamento real (requer 2 tenants em test env)

## Atualizacao 16/07/2026 — mecanica do `'use server'` CORRIGIDA + bypass com outro nome

### ⚠️ Correcao factual: o registro e por EXPORT ALCANCAVEL, nao pelo modulo inteiro
A doc/memoria afirmava que, se um modulo `'use server'` entra no grafo do cliente, o Next
registra **todos** os seus exports como endpoint. **Medido no build (Next 16) e falso:**
`actions/conteudos.ts` esta no grafo do cliente (`app/admin/conteudos/page.tsx` e
`.../kit/page.tsx` sao `'use client'` e o importam) e mesmo assim so **13 de 16 exports**
entraram no `server-reference-manifest.json`. Os 3 de fora sao exatamente os que **nenhum
client component chama** (`gerarConteudoLote`, `gerarConteudoFinalPersonalizado`,
`prepararAudioPersonalizado`) — o servidor **rejeita** chamada a eles.

Consequencia: a protecao de um export nao-chamado-pelo-cliente e mais forte do que se
pensava (o servidor nem aceita), **mas segue ACIDENTAL** — um `import { x }` + chamada num
client component registra E publica, abrindo o endpoint.

Como medir: contar `exportedName` no manifest por modulo x exports do arquivo. Exige `next
build`; use canario (>50 ids resolvidos) antes de confiar no veredito — "id nao resolvido"
e o estado seguro, entao um regex quebrado passaria em silencio.

### 🟡 Bypass que os guards NAO pegam: parametro com outro NOME
`actions/conteudos.ts` (`'use server'`) exporta
`gerarConteudoFinalPersonalizado({ contentId, colab })`. Quando `colab` vem preenchido, o
lookup por sessao (`getAuthenticatedEmailFromAction` + `findColabByEmail`) e **PULADO** —
mesmo padrao do `internal` fechado em 09/07. Esse `colab` define `empresa_id` (contexto PPP
+ chave de cache) e `perfil_dominante`. `prepararAudioPersonalizado` tem a mesma forma.

- **NAO exploravel hoje** (nenhum dos dois esta no manifest — sem caller de cliente).
- **Os guards nao pegam:** `use-server-internal-guard` varre por AST procurando o
  identificador literal **`internal`**. Esta calibrado pro NOME, nao pro COMPORTAMENTO
  ("parametro que substitui a identidade da sessao"). Procurar outros nomes: `colab`,
  `colaborador`, `empresaId`, `email`, `userId`.
- **Caller legitimo:** `prepararEntregasJornada` (`actions/temporadas.ts`) —
  `protectedAction('content.manage')` + `assertTenantAccessAction` + colabs via `tenantDb`,
  entao o `colab` que ele passa e confiavel. **Nao e "zero callers → deleta o param".**
- **Fix correto (pendente):** padrao documentado — nucleo sem gate em `lib/`, a action
  `'use server'` gata sempre (resolve o colab da sessao) e o lote chama o nucleo direto.

### Rota do podcast: parametro de identidade AUTORIZADO (contraexemplo do padrao correto)
`/api/conteudo/[id]/podcast?colaboradorId=` serve o audio COM a saudacao da pessoa para
auditoria do admin. O parametro so vale **depois** do gate (`assertColabAccess`, que cobre
platform admin, o proprio colab e rh/gestor do tenant) + o colab e lido com
`.eq('empresa_id', content.empresa_id)`. E o oposto do bypass acima: aqui o parametro e
autorizado, nao confiado.
