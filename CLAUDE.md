# Vertho Mentor IA

Plataforma multi-tenant de desenvolvimento de competências por IA (escolas e empresas). Colaboradores passam por diagnóstico comportamental (DISC), recebem cenários situacionais por competência, conversam com IA avaliativa e seguem trilhas (**Temporadas**) com micro-conteúdos personalizados. Inclui geração de vídeo de microlearning, um **Portal do Representante** (canal comercial dos RCs) e ambientes de demonstração.

> **Um doc canônico por assunto** (consolidação de 27/07 — 21 arquivos absorvidos em 6):
>
> | Assunto | Doc |
> |---|---|
> | Mapa do produto ponta a ponta | `docs/PIPELINE-TRILHA.md` |
> | Modos de falha + riscos + pegadinhas de conteúdo | `docs/FMEA-PIPELINE.md` (§6 verificação 17/07 · §7 pegadinhas) |
> | Arquitetura | `docs/ARQUITETURA.md` · plano de evolução: `docs/plano-refatoracao-final.md` |
> | Segurança (estado + critérios de service-role) | `docs/SECURITY-STATUS.md` |
> | Prompts de IA (70, inclui o Kit) | `docs/CATALOGO-PROMPTS-IA.md` |
> | Custo/qualidade de IA | `docs/CUSTO-QUALIDADE.md` (espelho em `/admin/vertho/custo-ia`) |
> | Schema e migrations | `docs/SCHEMA-PROCESS.md` |
> | Vídeo (pipeline + 13 templates de cena) | `docs/GERADOR-VIDEO-MODULO.md` · prompt literal em `docs/PROMPT-ROTEIRO-VIDEO.md` |
> | Conteúdo canônico | `docs/MODULOS-BASE-CONTEUDO.md` · `docs/EXTRACAO-MANUSCRITO.md` · `docs/KIT-SEMANAL.md` |
> | Checklists (deploy, mudança grande, go-live) | `docs/CHECKLISTS.md` |
> | Modos da engine | `docs/MODO-PILOTO.md` (piloto e personalizado) |
> | Comercial / demo | `docs/PORTAL-REPRESENTANTE.md` · `docs/AMBIENTE-DEMO.md` |
> | Board (painel multi-modelo, interno) | `docs/BOARD-PAINEL.md` — a web enfileira, o **worker local** executa os 4 CLIs por assinatura |
> | Histórico (não é backlog) | `docs/HISTORICO-MIGRACAO.md` · `docs/HISTORICO-AUDITORIAS.md` |
>
> Este arquivo é o resumo operacional; `docs/LEVANTAMENTO-2026-07.md` guarda a auditoria geral de 17/07.

### 📁 Onde criar `.md` — **`docs/` é o único lugar**

Todo documento novo nasce em **`docs/`** (27/07: a raiz foi esvaziada; `ARQUITETURA`, `PASSO-A-PASSO`,
`RESUMO` e `FEATURES-E-BENEFICIOS` mudaram para lá). **Quatro exceções, todas por contrato técnico —
mover qualquer uma quebra o carregamento:**

| Exceção | Por quê |
|---|---|
| `CLAUDE.md` (raiz) | carregado automaticamente **por convenção de caminho** |
| `AGENTS.md` (raiz) | idem, para outros agentes |
| `.claude/skills/<nome>/SKILL.md` | o caminho **é** o identificador da skill |
| `README.md` de subprojeto (`worker-hetzner/`, `video-spike/`, `data-pipeline/`…) | pertence à pasta que descreve |

Antes de criar arquivo novo, **procure quem já cobre o assunto** — a tabela acima é o índice, e a
regra é um doc canônico por assunto. Doc que só registra o passado vai para `docs/HISTORICO-*.md`;
material que não é documentação de engenharia (dump de dados de tenant, notas de sessão) **não entra
no repo** — o repositório é público.

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

**Migrations**: arquivos em `migrations/NNN-nome.sql` (sequencial). Aplicadas por **script node + driver `pg`** lendo `DATABASE_URL` do `.env.local` + `NOTIFY pgrst, 'reload schema'` — o MCP Supabase é read-only. NÃO existe `supabase/migrations/` nem se usa `supabase db push`. Ver `docs/SCHEMA-PROCESS.md`. ⚠️ `CREATE INDEX CONCURRENTLY` (e qualquer DDL proibido em transaction) **não vai pelo `apply-migration.mjs`** — ele manda o arquivo inteiro numa query só (multi-statement = transaction implícita). Usar script statement-a-statement; template: `scripts/_criar-indices-escala.mjs`.

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
- ⚠️ Resíduo conhecido (**2 entradas** na allowlist, verificado 23/07): `actions/whatsapp.ts` (`enviarWhatsApp`/`enviarAudio` — **boolean, sem revalidação de tenant**; maior risco: relay de WhatsApp = ban do número mata o canal de todos os tenants; ids hoje NÃO publicados no bundle — proteção acidental monitorada pelo CI). `fase1`/`fase3` removidos em 10/07; `actions/avaliacao-acumulada.ts` (×2) e `actions/evolution-report.ts` extintos em 23/07 (núcleos headless em `lib/season-engine/*-core.ts`, actions sempre gatadas — modelo pra qualquer resíduo futuro). Não copiar esse padrão.

### Sessão (auth): quem renova ≠ quem decide
- O **refresh** da sessão do Supabase vive no **`proxy.js`** — é o único ponto da request onde o cookie é gravável. O `cookies()` de um Server Component é **read-only**: um refresh disparado lá rotaciona o token no Supabase e **perde** o par novo no catch → o browser fica com o refresh token já consumido e a sessão morre no meio da navegação.
- Gate de auth **no cliente** usa **`getUser()`** (valida na rede), NUNCA `getSession()` — `getSession` devolve a sessão em MEMÓRIA, que sobrevive ao cookie morto. Servidor perguntando `getUser` e cliente perguntando `getSession` = as duas pontas divergem e o app entra em **laço `/rota-protegida` ↔ `/login`** (medido em prod 22/07: ~3 req/s). `getSession` só serve pra RENOVAR, nunca pra DECIDIR.
- Detalhe e testes: `docs/ARQUITETURA.md` §3.1.1 + `tests/unit/security/proxy-session-refresh.test.ts`.

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
- **Key de Storage SEMPRE via `storageSlug()`** (`lib/storage-slug.ts`) ao derivar de nome livre (pessoa, cargo) — Storage rejeita não-ASCII ("Invalid key"; já quebrou 2×: "Elizângela", "Corrêa"). Guarda: `tests/unit/storage-slug.test.ts`. O `filename` de download pode manter acento — só a key não.

## Deploy (ver a skill `/deploy`)

- `npm run build` (+ `tsc --noEmit`) **antes** — nunca empurrar quebrado.
- **`git add` SELETIVO** dos arquivos que EU editei — **NUNCA `git add -A`/`.`** (o dono edita o repo em paralelo).
- `git -C "<repo>" ...` — nunca `cd ... && git` (dispara approval).
- **`git push origin master`** deploya a Vercel. **NUNCA** `vercel --prod` (duplica).
- ⚠️ **O push pode NÃO gerar build — sem erro e sem aviso** (medido 06/08: commit chegou ao GitHub,
  `list_deployments` continuava no commit anterior; eu depurei código que não estava em produção
  enquanto o Rodrigo testava). Antes de investigar "não funcionou", **compare o SHA do último
  deployment** (`mcp__vercel__list_deployments` → `meta.githubCommitSha`) com `git log -1`.
  Destravar: `git commit --allow-empty -m "chore: dispara build" && git push`. As três causas de
  "não mudou nada" produzem a MESMA tela — build não disparou · aba no bundle antigo (Skew
  Protection segura o cliente 12 h → Ctrl+Shift+R) · bug de verdade. Descarte as duas primeiras
  primeiro; dá para provar a 2ª buscando a string nova no bundle servido.
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

### 🔴 Corolário: quando há DOIS caminhos, conserte o que RODA

Três vezes no mesmo dia (29/07) uma correção correta estava no gêmeo errado:

1. **Kit** — `resolverDesafioDoKit` normalizava o descritor desde 20/07, mas quem roda em produção é
   o CACHE (`precarregarKits`); o resolvedor individual só entra se o pré-carregamento falhar. 29
   leituras caíram no genérico **com o kit publicado na prateleira**.
2. **Missão** — o CENÁRIO tinha salvamento de JSON truncado, a MISSÃO não. 127 missões (108 no
   piloto real) renderizavam JSON cru na tela.
3. **Prompts de conversa** — dos três, só o `socratic` injetava a mensagem de abertura do turno 1.
   Os outros dois devolviam 500 e as semanas 4/8/12 **nunca funcionaram**.

**A regra:** ao corrigir um comportamento que tem dois caminhos (cache × live, gêmeo A × gêmeo B),
pergunte **qual deles o usuário percorre** — e conserte esse primeiro. Um teste de paridade não
prova nada se construir a entrada dos dois lados do mesmo jeito: o
`kit-entrega-paridade.test.ts` existia, passava verde, e a divergência de grafia nunca era
exercitada porque ele consultava o cache com a chave do brief, não com a do plano.

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
- NÃO confiar em `try/catch` para erro de query do **supabase-js** — ele **retorna** `{ error }`,
  não lança. Todo await de query tem que checar o retorno (`if (error)`), senão a falha passa
  invisível. Mordeu 2× no mesmo dia (27/07): F-C4 (`precarregarKits` devolvia Map vazio truthy)
  e o upsert de notas da IA4 (falhava e o `avaliacao_ia` era carimbado mesmo assim).
- NÃO interpolar valor vindo de fora em **string de comando** (shell). Server action é endpoint HTTP:
  o valor é escolhido pelo CLIENTE. Use variável de ambiente (`$env:`) ou argv — em 28/07 um
  `contextoDir` concatenado num comando PowerShell do worker era RCE local. E antes de "proteger com
  token", pergunte **onde o token vai morar**: se o formulário roda no navegador, ele iria no bundle
  público e **segredo em bundle não é segredo**. Casos e regra: `docs/SECURITY-STATUS.md` §28/07.
- NÃO confiar em teste verde sem saber **onde ele olha**. Asserção sobre agregado (síntese, resumo,
  total) esconde a parte quebrada: um E2E passou com 1 de 2 motores tendo lido o arquivo porque
  conferia só o resultado final, e um mock encadeável do supabase devolvia `count: undefined`,
  deixando dois testes de rate limit passarem sem exercitar nada. Quebre a invariante de propósito
  antes de contar o teste como prova.
- NÃO deixar **ramo raro** sem alguém percorrer antes do usuário — e, ao chamar CLI externo, NÃO
  assumir que o binário do seu terminal é o que vai rodar. Em 28/07 um `log()` inexistente dentro de
  um `if` que só dispara em caso raro matou um painel de 5 min já pago, e um `codex` **0.130 vs
  0.145** (três instalados, PATH diferente sob tarefa agendada) fez o CLI velho falhar de um jeito
  que **parecia erro do modelo**. Receita nos dois casos: teste que exercita o caminho raro por
  padrão + logar a versão no contexto real + capturar a saída COMPLETA (os últimos N chars cortam o
  cabeçalho, que é onde está a causa). Detalhe: `docs/BOARD-PAINEL.md`.
- NÃO tirar campo de formulário sem perguntar **que regra do servidor lê aquele campo**. Campo de
  UI e régua de decisão/medição são um par: em 04/08 remover dois toggles do tablet do CONARH
  tornaria a classe **A inalcançável** (o predicado exigia `decide_ou_recomenda`), e o alerta de
  < 30 s do fechador morreria calado — nada no typecheck acusa. Mesma rodada, mesma classe: trocar
  o mecanismo de uma tela **obriga a renomear a métrica**; manter `nota_instintiva`/`divergencias`
  medindo outra coisa é como um painel passa a mentir sem ninguém perceber (os campos foram
  REMOVIDOS, e leads velhos ficam fora da conta em vez de convertidos). Detalhe:
  `docs/CONARH52-SPRINT-CONSOLIDADO.md` §0.1.
- NÃO tornar A pré-requisito de B sem perguntar **se existe tenant em que A nunca será satisfeito**.
  Empresa com `sys_config.perfil_externo_fonte` (OPQ32/Hogan) não faz o DISC nativo, então
  `perfil_comportamental_liberado = false` é o estado **correto e permanente** dela — e o gate de
  cenários, que exigia o perfil, tornava o mapeamento **inalcançável** no Boehringer (06/08). O
  sintoma chega como bug do usuário ("ou libera os 2 ou bloqueia os 2"), não como configuração.
  O acoplamento estava em 3 camadas e **só o gate barrava de verdade** — corrigir os botões sem
  corrigir `lib/access-gates/` não resolveria nada. Detalhe: `docs/ARQUITETURA.md` §3.6.
- NÃO prometer confidencialidade que depende do **tamanho da turma** sem um piso de N. A tela do
  assessment diz "Confidencial · RH vê apenas dados agregados" — verdade com 200 pessoas, falsa com
  2: agregado de 2 não anonimiza ninguém. E **não existe limiar no código** que segure isso
  (`lib/dna-organizacional/aggregate.ts` e `lib/perfil-organizacional/aggregate.ts` não têm piso; o
  único `N_MINIMO`, 10, está em `lib/scoring/colinearidade.ts:18` e é de outra medida). Medido em
  06/08 numa demo de 2 participantes — e a frase tinha sido copiada da tela para a mensagem de
  convite antes de alguém perceber. Antes de repetir a promessa em piloto/demo, ou põe piso de N ou
  troca a frase. Vale pra qualquer garantia cuja validade some quando o N encolhe.
- NÃO abrir gate de autenticação por regra genérica — é **allowlist explícita, com o motivo ao lado**.
  O vídeo de convite precisa ser visto por quem ainda NÃO tem login (exigir sessão é pedir que a
  pessoa faça primeiro o que o vídeo explica), então `/v/{guid}` ganhou exceção em
  `lib/videos-publicos.ts`: guid + tenant + slug + motivo, auditável lendo o arquivo. Duas
  pegadinhas viraram teste (validado por mutação): lookup com **`hasOwnProperty`, nunca `in`**
  (`"constructor"`/`"toString"` abririam o gate), e **apelido curto é POR TENANT** — "boas-vindas"
  é o nome óbvio, e um mapa global serviria o vídeo de um cliente no domínio de outro, com a logo
  certa e o conteúdo errado, sem erro nenhum na tela.
- NÃO filtrar valor livre (e-mail, slug) com **`.ilike()`**: `_` e `%` são curinga no Postgres, e
  e-mail com underscore casa gente que não é a mesma pessoa — em 06/08 a listagem de liderados
  (`.ilike('gestor_email', …)`) ficava mais larga que o gate de posse que eu tinha acabado de
  escrever com igualdade exata, o que produziria "card aparece mas não abre". Igualdade
  case-insensitive vai em código; `ilike` só com curinga INTENCIONAL. E quando um gate novo duplica
  um filtro que já existe numa listagem, as duas pontas têm que usar a **mesma régua**.
- NÃO criar fallback novo **silencioso** — fallback pode existir, nunca invisível: registre com
  `registrarDegradacao` (`lib/degradacao.ts`, nunca lança, dedup por chave com contador **por dia
  UTC** — a regra que lê olha 24h, então contador sem janela vira alarme crônico). Os 10
  pontos clássicos já estão instrumentados (28/07, mig 194) e o health estrutural lê
  `degradacao_log` toda madrugada (R10 do `lib/pipeline-health/regras.ts`).
  **A régua (28/07): na CONSTRUÇÃO, falhe alto** (build/admin — tem humano pra consertar:
  missão/cenário, semana sem core, DUO indisponível **abortam** com erro acionável — e "falha"
  inclui **resposta 200 vazia/não-parseável**, não só exceção); **na
  ENTREGA, degrade registrando** (leitura ao vivo — falhar duro quebra a pessoa sem recuperação).
- NÃO `.limit(1)` em `ppp_escolas` p/ representar a empresa — empresa-rede tem **1 PPP por escola**
  (Ibipeba: 11) e isso aplica uma escola sorteada à rede inteira, em silêncio. Consolidar:
  `buscarContextoPPP(tdb, {empresaId})` (texto), `buscarValoresDaRede`/`buscarValores` (valores) ou
  `resolverContextoEmpresa` (contexto cru do Kit). **9 sites** dessa classe foram fechados em 26-27/07
  (**F-I10** do `docs/FMEA-PIPELINE.md`); **guard de CI**: `tests/unit/security/ppp-rede-guard.test.ts`
  falha em cadeia que reduz a 1 linha sem `.eq('id')`. Uma escola específica é legítima — só precisa
  ser dita explicitamente.
- NÃO criar coluna/DDL novo para correção sem conferir o **schema atual** — a especificação do FMEA
  também envelhece: F-I4 pedia coluna `origem_disc` nova e a `micro_conteudos.disc` (mig 142) já fazia
  o papel (sobrevive ao SET NULL). E antes de deletar conteúdo, varrer **referências JSONB**
  (`temporada_plano`: `core_id`, `formatos_disponiveis[].id`) — não há FK que avise.
- NÃO "padronizar" o DISC dos kits/vídeos para 2 letras — a geração de conteúdo ancora na **1ª letra
  de propósito** (4 células de custo, decisão 27/07 — F-I8). Só camadas derivadas em código
  (relatório/PDF) usam o combo completo.
- NÃO gravar TÍTULO no campo `descritor` do Módulo-Base — é por ele que o resolver casa o conteúdo.
  Título editorial vive em `titulo`; `descritor` recebe o **`nome_curto` da régua**. Ao corrigir,
  **recalcular `descritor_embedding`** (o vetor tem precedência sobre tokens, então o antigo continua
  mandando). Medido 28/07: 18 MBs assim fizeram 14 conteúdos ancorarem no assunto vizinho, em
  silêncio — **F-I12** do `docs/FMEA-PIPELINE.md`. Guarda: R9 do health estrutural.
- NÃO trabalho pós-response sem `after()`.
- NÃO decidir auth no cliente com `getSession()` — é `getUser()`.
- NÃO enviar comunicação real de tenant de demo.
- NÃO commitar secrets / instalar dependência desnecessária sem necessidade clara.
- NÃO criar `.md` fora de `docs/` (salvo as 4 exceções de contrato) nem versionar dump de dados de tenant / notas de sessão — **o repo é público**.
- O backend legado em **Google Apps Script** (GAS) é **dormant** — o app evoluiu muito além dele; NÃO tentar manter paridade.
