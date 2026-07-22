# Vertho Mentor IA

Plataforma multi-tenant de desenvolvimento de competências por IA (escolas e empresas). Colaboradores passam por diagnóstico comportamental (DISC), recebem cenários situacionais por competência, conversam com IA avaliativa e seguem trilhas (**Temporadas**) com micro-conteúdos personalizados. Inclui geração de vídeo de microlearning, um **Portal do Representante** (canal comercial dos RCs) e ambientes de demonstração.

> Docs canônicas em `docs/` (**PIPELINE-TRILHA** ← mapa ponta a ponta do produto, ARQUITETURA, MODO-PILOTO, CATALOGO-PROMPTS-IA, SECURITY-STATUS, SCHEMA-PROCESS, AMBIENTE-DEMO, PORTAL-REPRESENTANTE, DESIGN-SYSTEM, **LEVANTAMENTO-2026-07** ← auditoria geral 17/07 (fluxos/UX/segurança/arquitetura), **ANALISE-RISCOS-PIPELINE-TRILHA** ← riscos do pipeline 17/07…). Este arquivo é o resumo operacional.

## Stack (real)

- **Runtime**: Next.js 16 (App Router) + React — **TypeScript em todo o projeto** (~670 arquivos `.ts/.tsx`). NÃO escrever JavaScript.
- **Banco**: Supabase (PostgreSQL). O app acessa via **supabase-js/PostgREST** (não `pg` direto, exceto scripts).
- **Estilo**: Tailwind CSS.
- **LLM**: **Claude API** via `@anthropic-ai/sdk` — sempre por `callAI`/`callAIChat` (`actions/ai-client.ts`). Default `claude-sonnet-4-6`; `claude-opus-4-6` só para roteiros de vídeo. Fallback de provedor `gpt-5.4-2026-03-05` (OpenAI — o alias puro morreu p/ a chave); Gemini e **Kimi/Moonshot (`kimi*`, OpenAI-compatible)** também suportados. Modelos reasoning: `options.reasoningEffort` (kimi-k3, gpt-5.x).
- **Jobs de fundo**: Trigger.dev v4 (`trigger/`).
- **Deploy**: Vercel (via `git push`).
- **Vídeo**: Bunny Stream (hosting) + HeyGen (avatar) + Remotion (render, `RENDER_BACKEND=hetzner`).
- **WhatsApp**: `lib/whatsapp` (failover Z-API + WaSender).
- **Multi-tenant**: por subdomínio `*.vertho.ai` (`acme.vertho.ai`); o tenant é resolvido pelo header `x-tenant-slug`.

## Comandos

```bash
npm run dev            # dev server
npm run build          # build de produção (rodar ANTES de considerar tarefa pronta)
npx tsc --noEmit       # typecheck
npm run test:unit      # testes (vitest, tests/unit/)
npm run reset:demo     # reseta o tenant de demonstração acme-demo
```

**Migrations**: arquivos em `migrations/NNN-nome.sql` (sequencial). Aplicadas por **script node + driver `pg`** lendo `DATABASE_URL` do `.env.local` + `NOTIFY pgrst, 'reload schema'` — o MCP Supabase é read-only. NÃO existe `supabase/migrations/` nem se usa `supabase db push`. Ver `docs/SCHEMA-PROCESS.md`.

## Diretórios-chave

```
app/                 App Router (admin/, api/, dashboard/, representante/, proposta/)
actions/             Server Actions
  ai-client.ts       ★ wrapper único de IA (callAI, callAIChat) — NÃO criar outros
  fase1..fase4.ts    pipeline de IA (IA1 top10, IA2 gabarito, IA3 cenários, IA4 mapeamento)
lib/
  supabase.ts        ★ createSupabaseAdmin() (service-role)
  tenant-db.ts       ★ tenantDb(empresaId) — isolamento multi-tenant (ver abaixo)
  scoring/           ★ motor de fit/adequação (calcularFitUnificado)
  season-engine/     motor de trilha (temporadas, piloto, arguição, fechamento)
  ai-batch.ts        Batch API da Anthropic (−50%) p/ geração em lote
  demo/              reset do tenant de demo (reset-acme-demo.ts)
  sales/, whatsapp/, internal-emails.ts
components/          page-shell.tsx (PageContainer/PageHero/GlassCard/SectionHeader), pdf/, sales/
migrations/          NNN-nome.sql
trigger/             tasks Trigger.dev (deploy MANUAL — ver abaixo)
tests/unit/          vitest
```

## Padrões OBRIGATÓRIOS

### Multi-tenant (segurança)
- O app roda **100% service-role** (`createSupabaseAdmin` **bypassa RLS**). O isolamento entre tenants depende do **código**, não do banco.
  - Isso é literal, não retórico: `service_role` tem `rolbypassrls = true`. As tabelas de PII **já têm RLS ligada com policies tenant-scoped**, e mesmo assim a service-role lê cross-tenant (medido: 207 linhas / 8 empresas em `colaboradores`; `anon` lê 0). `ALTER TABLE … FORCE ROW LEVEL SECURITY` **não** resolve — `FORCE` afeta o dono da tabela, não roles com `BYPASSRLS`. Adicionar policy não protege o app; só protegeria se as queries saíssem como `authenticated` (JWT com claim `empresa_id`, que `get_empresa_id()` já lê).
- Todo acesso a dado de tenant vai por **`tenantDb(empresaId)`** (escopa por `empresa_id`).
- **Guards de tenant no CI** (allowlists que só encolhem): `tenant-mutation-guard` (update/delete raw) e `tenant-read-guard` (select raw nas 5 tabelas de PII: colaboradores, respostas, relatorios, mensagens_chat, sessoes_avaliacao). Para sair da allowlist: `tenantDb(...)` ou `.eq('empresa_id', empresaId)` na mesma cadeia. Ambos veem que **há** filtro, não que o **valor** é o tenant certo.
- Resolver colaborador SEMPRE com **`findColabByEmail`** (resolve o tenant pelo header) — NUNCA `.eq('email')` direto (usuário em 2+ empresas → quebra).

### Server Actions são endpoints HTTP (autorização)
- Num arquivo `'use server'`, **todo export vira um endpoint HTTP**. Logo, um parâmetro que pula o gate é escolhido pelo **cliente**, não pelo servidor.
- **NÃO existe flag `internal` numa action.** O padrão antigo (`internal: boolean` ou `internal?: { empresaId }`) foi um furo de autorização — o action id de `gerarBlueprint` estava no bundle público, e o bypass era chamável sem sessão. Removido de `blueprint.ts`, `relatorios.ts`, `temporadas.ts` (09/07).
- **Caminho headless** (script, seed, task Trigger, cron): extrair um **núcleo sem gate** para `lib/`, fora de `'use server'`, e chamá-lo direto. Modelos: `lib/blueprint/core.ts`, `lib/modulo-base-auditor.ts`. A action `'use server'` aplica o gate **sempre** e delega ao núcleo; lotes aplicam o gate uma vez e o núcleo revalida o tenant por item (`empresaIdEsperado`).
- Auditar o que está exposto: `.next/server/server-reference-manifest.json` = ids que o servidor **aceita**; grep do id em `.next/static/chunks/` = ids que o browser **publica**.
- **Guard no CI**: `tests/unit/security/use-server-internal-guard.test.ts` + `config/use-server-internal-allowlist.json`. Varre por AST os arquivos `'use server'` versionados e falha se um export novo aceitar `internal` (nos 3 formatos: identificador, destructuring, membro do tipo de `opts`). A allowlist é **dívida declarada, só pode encolher** — adicionar entrada pra "passar o CI" é exatamente o bug que ele existe pra pegar.
- ⚠️ Resíduo conhecido (**5 entradas** na allowlist, verificado 17/07): `actions/whatsapp.ts` (`enviarWhatsApp`/`enviarAudio` — **boolean, sem revalidação de tenant**; maior risco: relay de WhatsApp = ban do número mata o canal de todos os tenants; ids hoje NÃO publicados no bundle — proteção acidental monitorada pelo CI), `actions/avaliacao-acumulada.ts` (×2) e `actions/evolution-report.ts` (forma `{empresaId}` — revalidam o tenant). `fase1`/`fase3` removidos em 10/07. Não copiar esse padrão.

### Sessão (auth): quem renova ≠ quem decide
- O **refresh** da sessão do Supabase vive no **`proxy.js`** — é o único ponto da request onde o cookie é gravável. O `cookies()` de um Server Component é **read-only**: um refresh disparado lá rotaciona o token no Supabase e **perde** o par novo no catch → o browser fica com o refresh token já consumido e a sessão morre no meio da navegação.
- Gate de auth **no cliente** usa **`getUser()`** (valida na rede), NUNCA `getSession()` — `getSession` devolve a sessão em MEMÓRIA, que sobrevive ao cookie morto. Servidor perguntando `getUser` e cliente perguntando `getSession` = as duas pontas divergem e o app entra em **laço `/rota-protegida` ↔ `/login`** (medido em prod 22/07: ~3 req/s). `getSession` só serve pra RENOVAR, nunca pra DECIDIR.
- Detalhe e testes: `ARQUITETURA.md` §3.1.1 + `tests/unit/security/proxy-session-refresh.test.ts`.

### Trabalho pós-response numa rota
- DEVE usar **`after()`** (`next/server`). Uma IIFE solta (`(async()=>{})()`) morre no freeze da lambda pós-response.
- Trabalho pesado que precisa de **retry/status** → **task Trigger.dev** + coluna de status na tabela + gate/polling no client, com `after()` só como fallback/self-heal (ex.: acumulada do piloto, `trigger/acumulada-piloto.ts`).

### IA
- Só `callAI`/`callAIChat` — NÃO criar wrappers novos.
- **Prompt caching**: o system >4000 chars já é cacheado (`cache_control`). Para lote com prefixo grande e estável (régua/cenário repetidos entre colabs), passar `options.cachedUserPrefix` (2º breakpoint). Ver IA4 (`fase3.ts`) e o check (`check-ia4.ts`).
- Geração em lote de fundo (kit/conteúdos/roteiros) usa **`lib/ai-batch.ts`** (−50%).
- JSON estruturado: pedir JSON no prompt + parsear (há helpers de extração).

### Demo / envios
- Tenant de demo (`is_demo`) NÃO envia WhatsApp/e-mail real (guardrail em `lib/demo/envio-guard`). Personas de demo são `*.demo@vertho.ai` (sem telefone).
- `*.demo@vertho.ai` são **personas de demo, não staff** — isentas da exclusão de contas internas (`lib/internal-emails.ts`), pra aparecerem em ranking/DNA.

### Convenções
- Telefone sempre em **E.164**.
- `async` sempre com `try/catch`; componentes funcionais com hooks.
- Não commitar secrets — tudo em `.env.local`.

## Deploy (ver a skill `/deploy`)

- `npm run build` (+ `tsc --noEmit`) **antes** — nunca empurrar quebrado.
- **`git add` SELETIVO** dos arquivos que EU editei — **NUNCA `git add -A`/`.`** (o dono edita o repo em paralelo).
- `git -C "<repo>" ...` — nunca `cd ... && git` (dispara approval).
- **`git push origin master`** deploya a Vercel. **NUNCA** `vercel --prod` (duplica).
- **Trigger.dev**: tasks em `trigger/` **NÃO** sobem no push — precisam de `npx trigger.dev deploy` manual (path com espaço quebra o CLI; receita em `docs`/memória).

## Domínio: modelo de competências & Temporadas

> **Pipeline completo (assessment → blueprint → trilha → conteúdo → kit → entrega → envio):
> `docs/PIPELINE-TRILHA.md`** — pré-requisitos, fontes, produto e onde cada coisa persiste,
> com `arquivo:linha`. Leia antes de mexer em qualquer camada do motor.
> **Modos de falha (27 catalogados, corrida/integridade/escala): `docs/FMEA-PIPELINE.md`** —
> cada um com gatilho `arquivo:linha`, status (já-observado/provável/raro/só-em-escala) e correção.

- Competências (por cargo) × descritores × **4 níveis** (N1 lacuna → N4 referência). Ética é camada de valores (Alinhado/Tensão/Violação), não competência.
- **DISC** → o perfil comportamental vira colunas `comp_*`/`lid_*` em `colaboradores`. O **motor de fit lê essas colunas** (não `descriptor_assessments`).
- **Temporadas** (trilhas), por `programa_modo` (carimbo na trilha, mig 154):
  - **Regular DUO** (default, 14 semanas), **Onboarding** (10), **Piloto** (2 semanas + fechamento).
  - Fechamento (sem 14 / espelho no piloto): Cenário B + **scorer** + **check** (2ª IA) + **arguição** (defesa oral) + **trava** (piloto) + **Evolution Report**.
- Scoring: `lib/scoring::calcularFitUnificado` (Adequação + Fit v2), knockouts como gate, `spec_version` versiona a régua (congela histórico).

## ⚠️ A forma GRAVADA ≠ o que é ENTREGUE — leia o CONSUMIDOR

Várias camadas desta base resolvem a entrega na **LEITURA**, não no que está gravado.
Antes de afirmar o que a pessoa recebe, **leia quem consome** — não a tabela/campo:

- **`conteudo.formatos_disponiveis` NÃO contém vídeo.** O `ConteudoViewer` (week page) compõe
  `[...keys(formatos_disponiveis).filter(≠'video'), ...(temVideo?['video']:[])]`, com `temVideo`
  vindo de `resolverVideoDaSemana` AO VIVO. `kit/entrega-semana` faz `if (formato==='video') continue`.
- **`videos_gerados` é o deck GENÉRICO da célula.** O que a pessoa assiste é `videos_personalizados`
  (COM "Olá,{nome}") — `resolverCelulaVideo` prefere por `(cell_video_id, colaborador_id)` e só cai
  no deck se não existir.
- **`conteudo.desafio_texto` gravado é PLACEHOLDER** ("Aplique {descritor}…", sem custo de IA). O
  desafio real vem do Kit via `overlayKitNaSemana`, por **(DISC × cargo)**, na leitura. `aplicarOverlayKit`
  já roda em `listarTemporadasEmpresa` → a tela admin já mostra o real.
- **`regerarSemana` NÃO re-seleciona conteúdo** — só refaz desafio/missão/cenário por IA e reseta o
  progresso da semana. A seleção de conteúdo vive em `buildSeason::montarSemanaConteudo`.
- **Conteúdo de KIT é DISC-específico e sai SÓ pelo overlay.** O build é cego a DISC → `conteudosDoBuild()`
  + `.is('kit_id', null)` o excluem. Ver `tests/unit/conteudo-isolamento-disc`.

**Por que isto está aqui:** ignorar essa distinção custou 4 correções em cadeia numa única sessão
(16/07) — e escondeu um vazamento de DISC em produção (23 de 648 entregas) por semanas, porque
nenhuma tela mostrava o que era entregue. Ao investigar entrega, a pergunta é **"quem lê isso?"**,
nunca **"o que está gravado aqui?"**.

## Testes
`npm run test:unit` (vitest) — **roda no CI** (`typecheck.yml`, passo "Security tests + service-role guard"). Preferir extrair lógica pura + testar helpers; para actions com Supabase, mock encadeável (ver `tests/unit/piloto/report-tenant-piloto.test.ts`).

- **Integrações externas** (IA, HeyGen, Bunny, WhatsApp): testar o CONTRATO do wrapper em `tests/unit/integrations/` — herda o `include` do `vitest.config.ts` e o CI, sem config nova. Modelo: `tests/unit/integrations/whatsapp-failover.test.ts` (adapters stubados, `fetch` real lança). **NUNCA chamar API real.**
- Mock testa o NOSSO código, nunca o do fornecedor: se a API externa mudar, o teste passa feliz. Para isso, canary/health check — não `.test.ts`.
- Teste que nunca falhou não prova nada: **validar por mutação** (quebrar a invariante no código de produção e confirmar que o teste correspondente falha) antes de considerar pronto.

⚠️ Não rodar `npm run build | tail` — o pipe fecha e deixa um `next build` órfão segurando o lock ("Another next build process is already running", `.next` sem `BUILD_ID`). Redirecionar pra arquivo: `npm run build > log 2>&1`.

## Ferramentas: MCP + Skills

**MCP servers** (config em `.mcp.json`, gitignored/local) — usar nas investigações em vez de curl/scripts:
- **Supabase** (`mcp__supabase__*`) — **read-only** (`list_tables`, `execute_sql`, `get_advisors`, `get_logs`). Auditar schema/registros/tenant/RLS. **Escrita** (migrations) NÃO vai por aqui — é `node scripts/apply-migration.mjs` (ver skill `migrations`).
- **Vercel** (`mcp__vercel__*`) — *configurado no MCP global (`~/.claude.json`), não no `.mcp.json` do projeto* — deploys, `get_runtime_logs`, `get_runtime_errors`, duração de função, envs. Project `vertho-app` (`prj_fnvJs6mD7G8q7D5t6VSCDki6VELE`, team `team_u3hDlmBbi5IVqg5OcL4P394u`).
- **Sentry** (`mcp__sentry__*`) — erros de produção (stack trace, frequência, versão/deploy). OAuth (login no browser na 1ª chamada).
- **stitch** (Google Stitch) — design.

**Skills** (`.claude/skills/`, versionadas — invocar por `/nome` ou carregar quando o contexto casar): `deploy`, `migrations`, `multi-tenant`, `trigger-dev`, `ai-calls`, `video`, `competency-matrix`, `scenario-generation`.

## NÃO fazer
- NÃO escrever JavaScript — é **TypeScript**.
- NÃO `git add -A`, `vercel --prod`, `cd && git`.
- NÃO query de colaborador por email direto — usar `findColabByEmail`.
- NÃO trabalho pós-response sem `after()`.
- NÃO decidir auth no cliente com `getSession()` — é `getUser()`.
- NÃO enviar comunicação real de tenant de demo.
- NÃO commitar secrets / instalar dependência desnecessária sem necessidade clara.
- O backend legado em **Google Apps Script** (GAS) é **dormant** — o app evoluiu muito além dele; NÃO tentar manter paridade.
