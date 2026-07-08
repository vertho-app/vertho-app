# Vertho Mentor IA

Plataforma multi-tenant de desenvolvimento de competências por IA (escolas e empresas). Colaboradores passam por diagnóstico comportamental (DISC), recebem cenários situacionais por competência, conversam com IA avaliativa e seguem trilhas (**Temporadas**) com micro-conteúdos personalizados. Inclui geração de vídeo de microlearning, um **Portal do Representante** (canal comercial dos RCs) e ambientes de demonstração.

> Docs canônicas em `docs/` (ARQUITETURA, MODO-PILOTO, CATALOGO-PROMPTS-IA, SECURITY-STATUS, SCHEMA-PROCESS, AMBIENTE-DEMO, PORTAL-REPRESENTANTE, DESIGN-SYSTEM…). Este arquivo é o resumo operacional.

## Stack (real)

- **Runtime**: Next.js 16 (App Router) + React — **TypeScript em todo o projeto** (~670 arquivos `.ts/.tsx`). NÃO escrever JavaScript.
- **Banco**: Supabase (PostgreSQL). O app acessa via **supabase-js/PostgREST** (não `pg` direto, exceto scripts).
- **Estilo**: Tailwind CSS.
- **LLM**: **Claude API** via `@anthropic-ai/sdk` — sempre por `callAI`/`callAIChat` (`actions/ai-client.ts`). Default `claude-sonnet-4-6`; `claude-opus-4-6` só para roteiros de vídeo. Fallback de provedor `gpt-5.4` (OpenAI); Gemini também suportado.
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
- Todo acesso a dado de tenant vai por **`tenantDb(empresaId)`** (escopa por `empresa_id`).
- Resolver colaborador SEMPRE com **`findColabByEmail`** (resolve o tenant pelo header) — NUNCA `.eq('email')` direto (usuário em 2+ empresas → quebra).
- Actions internas que pulam a sessão (reset de demo, crons, auto-triggers) recebem **`internal?: { empresaId }`** e **revalidam o tenant** (defesa em profundidade) — não um `boolean`.

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

- Competências (por cargo) × descritores × **4 níveis** (N1 lacuna → N4 referência). Ética é camada de valores (Alinhado/Tensão/Violação), não competência.
- **DISC** → o perfil comportamental vira colunas `comp_*`/`lid_*` em `colaboradores`. O **motor de fit lê essas colunas** (não `descriptor_assessments`).
- **Temporadas** (trilhas), por `programa_modo` (carimbo na trilha, mig 154):
  - **Regular DUO** (default, 14 semanas), **Onboarding** (10), **Piloto** (2 semanas + fechamento).
  - Fechamento (sem 14 / espelho no piloto): Cenário B + **scorer** + **check** (2ª IA) + **arguição** (defesa oral) + **trava** (piloto) + **Evolution Report**.
- Scoring: `lib/scoring::calcularFitUnificado` (Adequação + Fit v2), knockouts como gate, `spec_version` versiona a régua (congela histórico).

## Testes
`npm run test:unit` (vitest). Preferir extrair lógica pura + testar helpers; para actions com Supabase, mock encadeável (ver `tests/unit/piloto/report-tenant-piloto.test.ts`).

## Ferramentas: MCP + Skills

**MCP servers** (config em `.mcp.json`, gitignored/local) — usar nas investigações em vez de curl/scripts:
- **Supabase** (`mcp__supabase__*`) — **read-only** (`list_tables`, `execute_sql`, `get_advisors`, `get_logs`). Auditar schema/registros/tenant/RLS. **Escrita** (migrations) NÃO vai por aqui — é `node scripts/apply-migration.mjs` (ver skill `migrations`).
- **Vercel** (`mcp__vercel__*`) — deploys, `get_runtime_logs`, `get_runtime_errors`, duração de função, envs. Project `vertho-app` (`prj_fnvJs6mD7G8q7D5t6VSCDki6VELE`, team `team_u3hDlmBbi5IVqg5OcL4P394u`).
- **Sentry** (`mcp__sentry__*`) — erros de produção (stack trace, frequência, versão/deploy). OAuth (login no browser na 1ª chamada).
- **stitch** (Google Stitch) — design.

**Skills** (`.claude/skills/`, versionadas — invocar por `/nome` ou carregar quando o contexto casar): `deploy`, `migrations`, `multi-tenant`, `trigger-dev`, `ai-calls`, `video`, `competency-matrix`, `scenario-generation`.

## NÃO fazer
- NÃO escrever JavaScript — é **TypeScript**.
- NÃO `git add -A`, `vercel --prod`, `cd && git`.
- NÃO query de colaborador por email direto — usar `findColabByEmail`.
- NÃO trabalho pós-response sem `after()`.
- NÃO enviar comunicação real de tenant de demo.
- NÃO commitar secrets / instalar dependência desnecessária sem necessidade clara.
- O backend legado em **Google Apps Script** (GAS) é **dormant** — o app evoluiu muito além dele; NÃO tentar manter paridade.
