# Auditoria de Arquitetura — App inteiro (jun/2026)

> Revisão de engenharia sênior do app **Vertho** (Next.js 16 + Supabase, multi-tenant).
> Método: 5 explorações paralelas (core/fases, auth/RLS, radar, actions/API, frontend) + verificação manual dos achados críticos.
> Escopo: ~106k LoC — `app/` (249), `lib/` (130), `actions/` (61), `components/` (42), `trigger/` (5).
>
> ⚠️ Achados de **segurança** devem ser **confirmados** antes de qualquer correção (alguns vêm de análise automatizada e podem ter imprecisão de linha/contexto).

---

## 1. Resumo da arquitetura

App **multi-tenant** com subdomínio por empresa (`empresa.vertho.ai`). Pilares:

- **Núcleo de domínio** — motor de temporada em **5 fases sequenciais** (`actions/fase1-5.ts` + `lib/season-engine/`) que transforma diagnósticos em trilhas personalizadas de 10–14 semanas. Forte uso de **IA** (Claude/Gemini/OpenAI) para gerar conteúdo, cenários, avaliações e relatórios.
- **Auth em 2 camadas** — roles do tenant (`colaboradores.role`: colaborador/gestor/rh/tutor) + admins de plataforma (`platform_admins`: master/socio) com permissões granulares (`permission_overrides`).
- **Camada de dados** — **service-role em ~150 server actions** (RLS é *bypassado* no servidor; a proteção real são os checks de permissão na aplicação). Browser usa anon key + RLS.
- **Radar** — subsistema de inteligência comercial B2B (escolas/municípios; Saeb/Ideb/Enem/Censo) com SSR público + PDFs gerados por IA.
- **Frontend** — App Router com **client components monolíticos** (páginas de 1000+ linhas).

---

## 2. Riscos de segurança / robustez (prioridade máxima)

| # | Achado | Onde | Gravidade | Ação |
|---|---|---|---|---|
| S1 | **UPDATE/DELETE de colaborador sem validar tenant** — busca o `empresa_id` mas faz `.update()/.delete().eq('id', id)` sem conferir que o colaborador pertence ao tenant do admin. | `app/admin/empresas/gerenciar/actions.ts:288,327` | **Crítico SE** admin com escopo de tenant puder chamar (CONFIRMAR o modelo de admin) | `assertTenantAccess(ctx, existente.empresa_id)` após o fetch |
| S2 | **Webhooks sem verificação de assinatura** — Z-API `disconnected` só compara um header de segredo; sem HMAC. | `app/api/webhooks/zapi/*` | Alto (spoofável; replay) | HMAC-SHA256 ou Receiver em todos os webhooks |
| S3 | **Zero validação de input (Zod)** nas 61 actions + **~51 `JSON.parse` sem try/catch**. | transversal (`actions/*`) | Alto | Zod no topo + `JSON.parse` central (o `extractJSON` já existe — usar sempre) |
| S4 | **Sem rate-limit** em actions caras/públicas (geração IA, disparo em massa de WhatsApp/PDF). | `dispararLinks*`, `gerarConteudoIA`, lotes | Alto (DoS / custo) | token-bucket por `empresaId` nas actions custosas |
| S5 | **`admin_audit_log` sem filtro de empresa** (sócio enxerga auditoria de todas) + mudanças em `platform_admins` **não auditadas**. | `app/admin/auditoria/`, `app/admin/platform-admins/` | Médio (disclosure / privesc opaco) | filtrar por empresa quando não-master; `logAdminAction` no add/remove de admin |
| S6 | **`permission_overrides` permite auto-escalonamento** — bloqueia `deny` de permissão crítica, mas não valida `allow` acima da role base (sócio pode se dar `users.manage`). | `app/admin/permissoes/actions.ts` | Médio | validar que `allow` não escale além da role base |

**Risco sistêmico:** **service-role em tudo** (~150 actions) → 1 bug em qualquer check de permissão vaza/altera dados cross-tenant. RLS não é rede de segurança aqui. Mitigação atual: o app **falha-rápido** (crash) em vez de corromper silenciosamente, e há auditoria best-effort.

---

## 3. Problemas estruturais & duplicação

- **God-files:** `fase5.ts` (2112 LoC), `fase1.ts` (1745), `lib/radar/queries.ts` (1522), `actions/modulos-base.ts` (1273), `actions/conteudos.ts` (1137); páginas de **1000+ linhas** (`admin/conteudos`, `empresas/[id]`, `fase2`). Lógica de negócio mora nas *actions/pages* em vez de `lib/`.
- **Duplicação relevante:**
  - **radar ↔ radarbett** — implementações paralelas (queries, narrativas IA, páginas) que divergem.
  - **prompt-builders** repetidos 4–6× (fase1/3/5) com pequenas variações.
  - UI: **`Field`/`SelectField`/modais** redefinidos em 4+ páginas; helpers de **JSON-parse** e **formatação** copiados; 9 importers do radar sem base comum.
- **Retornos inconsistentes:** `{success,error}` vs `{ok,error}` vs exceção, sem tipo central.

---

## 4. Performance

- **N+1 + IA sequencial na fase5** (`actions/fase5.ts:1241-1365`): loop por colaborador re-filtra dados + `await callAI` inline → 50 colab × 5 comp ≈ **1250s serial** → **timeout** (rota max 300s).
- **Sub-paralelização:** ~**211 loops** vs **11 `Promise.all`** no app — lotes que poderiam ser `.in()` + pool.
- **Radar agrega em request-time** (sem materialização); `getTopBenchmarksMunicipal` faz **30+ queries/request** (O(N²)); `getDispersaoMunicipal` carrega todas as escolas e filtra em memória.
- **Frontend:** fetch em cascata sem Suspense; `JSON.parse` no render; PDFs importados estaticamente (bundle +~800KB) em vez de lazy.

---

## 5. Manutenibilidade

- `any` espalhado (40+ lugares nas páginas grandes); sem types gerados do schema Supabase.
- **Magic strings** (roles, status `enviado`/`respondido`/`rascunho`) sem enum.
- i18n por strings não tipadas (typo passa silencioso).
- Erros engolidos em `catch {}` (parcialmente mitigado pelo M3 no pipeline de vídeo).

---

## 6. Roadmap de refatoração (priorizado)

| Quando | Ação | Resolve |
|---|---|---|
| **Imediato (seg.)** | Confirmar+corrigir S1 (tenant em update/delete); HMAC nos webhooks (S2); auditar `platform_admins` (S5) | riscos críticos |
| **Alto** | Factory **`protectedAction(permission, zodSchema, fn)`** — força auth + tenant + validação no topo de toda action | S1, S3, parte de S4 + boilerplate |
| **Alto** | `lib/json-safe.ts` central + **rate-limiter** nas actions caras | S3, S4 |
| **Médio** | Quebrar god-files (`fase1/5`, `radar/queries`); UI compartilhada (`Field`/`Modal`/`Table`/`format`); **paralelizar lotes** (`.in()` + pool) | estrutura + perf |
| **Médio** | **Materializar agregações do Radar** (tabelas pré-computadas via cron) | perf radar |
| **Baixo** | Gerar types do Supabase; enums de status/role; tipar i18n | manutenção |

---

## 7. Anexo — ajustes JÁ feitos no pipeline de vídeo (jun/2026)

Esta auditoria seguiu uma frente de refatoração **do pipeline de geração de vídeo** (já no ar):

- **R1** removeu ~10 arquivos mortos (compositions V1/V2, cenas V1, `gerar-narracao` dead).
- **R3** unificou brand/voz/estilo.
- **R4** paralelizou narração/avatar/ffprobe (~25s/vídeo).
- **R5(b)** extraiu `lib/video/render-helpers.ts` (fim do D4).
- **M1** quebrou o god-module `gemini-tts.ts` (510→230) em `lib/tts/{audio-dsp,narration-text}`.
- **M2** validou o contrato `render_inputprops` (zod no produtor + guard no worker).
- **M3** tornou erros silenciosos visíveis.
- **M4** sincronizou **legendas e animações** com a fala via **Whisper** (word-level), mantendo a voz Gemini Callirrhoe.

> Os mesmos padrões aplicados ali (factory de validação, paralelização, quebra de god-files, contrato validado) são a base do roadmap acima para o resto do app.
