# Resumo de Retomada — Vertho App

> Atualizado em 27/07/2026. HEAD `09540329`.

## Onde esta o projeto

- Workspace: `C:\GAS\Vertho App\nextjs-app` (o repo Git e esta pasta, nao a pasta-pai).
- Branch: `master`. **`git push origin master` ja deploya** na Vercel — NAO rodar `vercel --prod` por cima (duplica).
- Stack: Next.js 16.2.4, React 19.2.4, Supabase/Postgres, Tailwind 4, TypeScript (~898 arquivos `.ts/.tsx`).
- IA: Claude (`@anthropic-ai/sdk` 0.96) como default, com OpenAI/Gemini/Kimi pelo mesmo wrapper (`actions/ai-client.ts`).
- Jobs de fundo: Trigger.dev v4 (`trigger/`) — **deploy MANUAL**, nao sobe no push.
- Video: HeyGen (avatar) + Remotion 4 (render, backend Hetzner) + Bunny Stream (hosting).
- Mapa completo: `ARQUITETURA.md`. Resumo operacional e regras obrigatorias: `CLAUDE.md`.

## Como retomar

```powershell
cd "C:\GAS\Vertho App\nextjs-app"
git status --short
npm run dev            # http://localhost:3000
```

Antes de considerar qualquer tarefa pronta:

```powershell
npm run build          # NUNCA com `| tail` (deixa next build orfao segurando o lock)
npx tsc --noEmit
npm run test:unit      # vitest — 904 testes em 98 arquivos (medido 27/07), roda no CI
```

Outros: `npm run smoke` · `npm test` (Playwright) · `npm run reset:demo` (reseta `acme-demo`).
⚠️ `npm run lint` esta QUEBRADO desde o Next 16 (`next lint` removido) — usar `tsc --noEmit`.

## Frentes recentes

**26-27/07** — **Uma fonte de contexto institucional por empresa.** Empresa-rede tem 1 PPP por escola
(Ibipeba: 11) e o `.limit(1)` aplicava uma escola sorteada ao municipio inteiro, em silencio — classe
**F-I10** no `docs/FMEA-PIPELINE.md`. Fechada nos 4 consumidores: valores do IA2 (`062dca13`, 26/07) e,
em 27/07, `buscarContextoPPP` (IA1/IA2/IA3), o check dual do IA3 e o PDF personalizado. Regua, kit e PDF
passam a ver a MESMA lente (`empresas.kit_contexto`); a chave de cache do PDF ganhou a assinatura do
contexto (F-E7 — fecha colisao entre escolas **e** a invalidacao quando entra PPP novo).
Os 2 guards de tenant voltaram ao verde (`3367efb7`): `certificado.ts` por `tenantDb`, `fetchColabPorId`
descobre o tenant e cobra via `empresaIdEsperado`.

**22-23/07** — **Auditoria de seguranca multi-agente** (223 arquivos, 29 achados confirmados)
remediada de ponta a ponta; classe dominante = gate que nao liga o `empresaId` do client ao tenant da
sessao (`docs/SECURITY-STATUS.md`). **Certificado de Conclusao** (PDF A4, branding duplo, minimo 75%
de participacao, piloto nao emite). **Modo Personalizado** (`ec3fd527`, mig 182): degustacao de 1-4
semanas, 1-2 competencias, fechamento opcional, com a config congelada na trilha. **Branding: puxar
paleta do site do cliente** (`c885e970`) — IA mapeia 7 slots, contraste garantido em codigo.
**Lotes de IA em segundo plano** com Batch API (−50%) e botao de parar (migs 172/173). Refresh de
sessao movido pro `proxy.js` (`8f5c1d1c`) — matou o laco `/admin/dashboard` ↔ `/login`.
DISC contextual movido pro Pulso (mig 183).

**20/07** — Telemetria de engajamento (`/admin/engajamento`), ledger de uso de IA (migs 177/178),
eventos de trilha (mig 179), provedor Kimi e `reasoningEffort` no wrapper de IA.

**06-07/07** — Portal do Representante: simulador de preco, redesign do documento de proposta,
versionamento `-Rn` (migs 166-168). Modo Piloto: acumulada virou task Trigger.dev com status
rastreavel (mig 169). ACME Demo: reset canonico unico.

## Produto (visao rapida)

- **Mentor IA** multi-tenant em `{empresa}.vertho.ai` — diagnostico (DISC + conversacional), PDI,
  trilha por temporadas, conteudo multi-formato, fechamento com dupla IA + arguicao, certificado.
  Modos: **Regular DUO** (14 sem, default) · **Onboarding** (10 sem) · **Piloto** (2 sem) ·
  **Personalizado** (1-4 sem, configuravel). Modo por empresa E por colaborador, com carimbo na trilha.
- **Pulso de Desenvolvimento** — T0/T2 + sinais + Dual-IA + PDFs (executivo e complementar NR-1).
- **Radar Vertho** (`radar.vertho.ai`) — inteligencia publica: escola, municipio, rede, estado,
  comparacao. Inclui matriculas do censo (178k escolas).
- **Portal do Representante** (`/representante`, interno) — funil de RCs, propostas, comissoes.
- **RadarEmpresas** (interno) — inteligencia comercial B2B, DuckDB local.
- **Tenants de demo**: `acme-demo` (vendedores, reset por cron/botao) e `cbtd-demo`.
- i18n pt-BR/pt-PT/es-ES (next-intl) + login por WhatsApp (OTP) alem do magic link.
- **Descontinuado:** `radarbett.vertho.ai` (redirect 301 desde 25/05).

## Banco e migrations

- **164 arquivos, `022` a `183`** (com gaps). Recentes: 172/173 `ia_jobs` (lote + parar),
  174 competencias-foco do cargo, 175/176 development blueprints + auditoria, 177/178 ledger e resumo
  de uso de IA, 179 eventos de trilha, 180 `videos_watched` por semana, 181 carimbo de pilula por
  canal, 182 config de programa na trilha (Modo Personalizado), 183 DISC contextual no pulso.
- **Aplicar**: `node --env-file=.env.local scripts/apply-migration.mjs migrations/NNN-x.sql`
  (driver `pg` + `DATABASE_URL`). O MCP Supabase e **read-only**; nao existe `supabase db push`.
  Detalhe: `docs/SCHEMA-PROCESS.md` e a skill `/migrations`.

## Pontos de atencao

- **RLS nao protege o app.** Ele roda 100% `service_role`, que tem `BYPASSRLS` — le cross-tenant mesmo
  com policies ligadas. O isolamento e responsabilidade do **codigo**: `tenantDb(empresaId)` sempre, e
  os guards de CI (`tenant-read-guard`, `tenant-mutation-guard`, `service-role-guard`,
  `use-server-internal-guard`) cobram. Allowlist so encolhe — adicionar entrada pra "passar o CI" e
  exatamente o bug que o guard existe pra pegar.
- **Todo export de arquivo `'use server'` e um endpoint HTTP.** Caminho headless (script, cron, task)
  chama um nucleo em `lib/`, nunca uma flag de bypass na action.
- `proxy.js` roteia por subdominio **e** e o unico lugar onde o cookie de sessao e gravavel (o refresh
  vive la; `cookies()` do RSC e read-only).
- Secrets so em `.env.local` e Vercel. **O repo e PUBLICO** — nunca versionar relatorio de
  vulnerabilidade ABERTA.
- Tasks do Trigger.dev exigem `npx trigger.dev deploy` manual (o path com espaco quebra o CLI —
  receita em `docs/`).

## Onde navegar

| Caminho | O que e |
|---|---|
| `app/` | rotas App Router (`admin/`, `api/`, `dashboard/`, `representante/`, `proposta/`) |
| `actions/` | server actions; `ai-client.ts` e o wrapper unico de IA |
| `lib/tenant-db.ts` | isolamento multi-tenant (ponto de entrada obrigatorio) |
| `lib/season-engine/` | motor das temporadas (trilha, kit, piloto, arguicao, fechamento) |
| `lib/scoring/` | motor de fit/adequacao (`calcularFitUnificado`, `spec_version`) |
| `lib/video/`, `trigger/`, `worker-hetzner/` | pipeline de video |
| `migrations/` | schema (sequencial, aplicado por script) |
| `tests/unit/` | vitest (48 arquivos), inclui os guards de seguranca |
| `docs/` | **PIPELINE-TRILHA** (mapa do produto), **FMEA-PIPELINE** (modos de falha), SECURITY-STATUS, CATALOGO-PROMPTS-IA, CUSTO-QUALIDADE, MODO-PILOTO, KIT-SEMANAL, PORTAL-REPRESENTANTE |
