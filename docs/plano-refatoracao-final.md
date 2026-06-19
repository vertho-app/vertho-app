# Plano de Refatoração — versão final (jun/2026)

> **Fonte:** consolida `docs/refatoracao-arquitetural-sugestoes.md` (roadmap incremental, ancorado em bugs reais) + `docs/auditoria-arquitetura-2026-06.md` (achados de segurança específicos + performance).
> **Princípio:** preservar o comportamento atual; tornar o caminho seguro também o caminho mais fácil.
> **Este doc supersede os dois anteriores como plano oficial.**

---

## 1. Resumo executivo

O Vertho App é um SaaS B2B **multi-tenant** (Next.js App Router + Supabase/Postgres + Vercel), com Resend, Z-API, QStash, geração de PDF e pipelines de IA (Claude/Gemini/OpenAI).

**Bases boas que JÁ existem** (e que devem ser preservadas/reforçadas, não substituídas):
- Guardas de auth/authz centralizados em `lib/auth/`.
- Wrapper `tenantDb()` que injeta `empresa_id` automaticamente.
- **Allowlist auditável** (`config/service-role-allowlist.json`) + **testes de segurança estruturais** (tenant isolation, CSRF, service-role).
- Documentação arquitetural (`ARQUITETURA.md`, `RESUMO.md`).

**A natureza do risco hoje é crescimento orgânico, não ausência de arquitetura:**
- Lógica crítica em arquivos muito grandes (god-files de 1000–2100 linhas).
- Fluxos semelhantes reimplementados em lugares diferentes (envio de link/email/WhatsApp; regras de liberação).
- Uso amplo de `service_role` — contido pela allowlist+testes, **mas** com alguns acessos crus que pulam o `tenantDb()` (um deles com hole real — ver S1).
- Processos pesados misturam banco + IA + PDF + storage + envio no mesmo bloco síncrono.

**Estratégia:** incremental, preservando comportamento — primeiro **hotfixes de segurança pontuais**, depois **consolidar infra duplicada + gates de produto**, depois **tenant-safe repos**, depois **quebrar god-files** e **observabilidade/jobs**, com **TypeScript** endurecido por módulo novo.

---

## 2. Mapa de arquitetura (resumido)

| Camada | Arquivos-chave | Papel |
|---|---|---|
| **Entrada/tenancy** | `proxy.js` | subdomínio → rewrite (radar/imprensa) ou header+cookie `x-tenant-slug` |
| **Auth/authz** | `lib/authz.ts`, `lib/auth/*`, `lib/permissions.ts`, `lib/admin-supabase.ts` | `platform_admins` (global) + `colaboradores.role` (por tenant); `findColabByEmail` fail-closed |
| **Dados** | `lib/supabase.ts`, `lib/tenant-db.ts`, `migrations/` | `createSupabaseAdmin()` (service-role) + `tenantDb(empresaId)` (injeta empresa_id) |
| **Produto** | `app/dashboard`, `app/admin`, `app/radar`, `actions/*`, `lib/season-engine`, `lib/radar` | dashboard, admin, radar público, pipelines |
| **IA/PDF/envios** | `actions/ai-client.ts`, `actions/fase*.ts`, `actions/conteudos.ts`, `lib/notifications` (a criar), `lib/zapi.ts` | roteador de IA; geração; envios |
| **Vídeo** (já refatorado) | `trigger/gerar-video-modulo.ts`, `lib/video/*`, `lib/tts/*`, `worker-hetzner/*` | pipeline de vídeo (R1–R5 + M1–M4 já no ar) |

---

## 3. Áreas problemáticas (priorizadas por severidade)

### 🔴 Segurança — hotfixes pontuais (fazer ANTES das fases)
| # | Achado | Onde | Ação |
|---|---|---|---|
| **S1** | **UPDATE/DELETE de colaborador sem checar tenant** — busca `empresa_id` mas faz `.update()/.delete().eq('id', id)` sem validar; usa service-role cru (não passa pelo `tenantDb`). **Verificado, é real.** | `app/admin/empresas/gerenciar/actions.ts:288,327` | `assertTenantAccess(ctx, existente.empresa_id)` após o fetch — ~15 min |
| **S2** | **Webhooks inbound sem assinatura** (Z-API `disconnected` só compara um header) | `app/api/webhooks/zapi/*` | HMAC-SHA256 / Receiver; rejeitar sem assinatura em prod |

### 🟠 Duplicação & regras espalhadas (Fase 1 — maior retorno, baixo risco)
- **Envio de link/email/WhatsApp** reimplementado em ~10 lugares (`magic-link/*`, `signup`, `pulse/envio`, `fase2`, `fase5`, `whatsapp*`). **Bug real:** `juliane@vertho.ai` caía em "sucesso silencioso" (platform-admin + duplicada em 2 tenants).
- **Regras de produto espalhadas** (perfil comportamental, mapeamento de cenários, votação, gate de temporada/PDI). **Bug real:** `mapeamento_cenarios_liberado` ausente bloqueava usuário pronto.

### 🟠 Service-role amplo (Fase 2 — tenant safety)
- Contido por allowlist+testes, mas rotas user-scoped dependem de disciplina manual. Repos tenant-safe **previnem estruturalmente** holes como o S1.

### 🟡 God-files (Fase 3)
| Arquivo | ~LoC | Risco |
|---|---:|---|
| `actions/fase5.ts` | 2100 | Alto |
| `actions/fase1.ts` | 1745 | Alto |
| `lib/radar/queries.ts` | 1522 | Alto |
| `actions/modulos-base.ts` | 1273 | Alto |
| `actions/conteudos.ts` | 1137 | Alto |
| páginas `admin/conteudos`, `empresas/[id]`, `fase2` | 1000+ | Alto |

### 🟡 Performance (encaixar ao tocar cada área)
- **fase5:** N+1 (re-filtra dados no loop por colaborador) + **IA sequencial** (50 colab × 5 comp ≈ 1250s → **timeout** rota 300s). → batch-load + pool de `await callAI`.
- **Radar:** agregações em **request-time** sem materialização; `getTopBenchmarksMunicipal` **30+ queries/request** (O(N²)). → materializar (cron) + RPC único.
- **App:** **211 loops vs 11 `Promise.all`** — lotes que deviam ser `.in()` + pool.
- **Frontend:** fetch em cascata sem Suspense, `JSON.parse` no render, PDFs não lazy (bundle +800KB).

### 🟢 Infra & robustez (Fase 4–5)
- **Rate-limit em memória** (`lib/rate-limit.ts`, `Map` por lambda) → **Upstash** distribuído (auth/IA/WhatsApp). 
- **~51 `JSON.parse` sem try/catch** → `extractJSON` central (já existe). 
- **`tsconfig` `strict:false`** → endurecer por módulo novo + tipos do Supabase.
- **Processos pesados síncronos** → jobs com status persistido; registrar tentativa de envio (provider/status/erro); custo/tempo de IA por chamada.

---

## 4. Roadmap por fases

### Fase 0 — Hotfixes de segurança (imediato, ~1 dia)
1. **S1:** `assertTenantAccess` em `atualizarColaborador`/`excluirColaborador`.
2. **S2:** HMAC nos webhooks inbound.
3. `logAdminAction` em add/remove de `platform_admins` (hoje sem auditoria).

### Fase 1 — Serviços de envio + gates (baixo risco, alto retorno)
1. `lib/auth/magic-link-service.ts`, `lib/notifications/{email,whatsapp,access-link}-service.ts`.
2. `lib/access-gates/{perfil-comportamental,mapeamento-cenarios,temporada,pdi}.ts` (retornam `GateResult` explícito).
3. Migrar `magic-link`, `signup`, `magic-link-whatsapp`, `votacao/status` para os serviços/gates.
4. **Testes unitários:** platform-admin sem tenant; colaborador com tenant; email duplicado em tenants; Resend/Z-API indisponível.

### Fase 2 — Tenant-safe repositories (reduz blast radius do service-role)
- `lib/repositories/{colaboradores,empresas,assessment,temporadas,relatorios}-repo.ts`.
- Migrar primeiro `dashboard-actions`, `assessment-actions`, `api/assessment`, `api/chat`.
- **Factory `protectedAction(permission, zodSchema, fn)`** — força auth + tenant + validação no topo de toda action (mata boilerplate + previne S1 + cobre S3 de validação).

### Fase 3 — Quebrar god-files (facade + módulos por caso de uso)
- Ordem: `fase5` → `fase1` → `conteudos` → `radar/queries`.
- Manter o arquivo como **facade** (re-export); mover internos por domínio; typecheck + smoke antes/depois.
- **Ao tocar `fase5`: já paralelizar** os lotes (batch-load + pool de IA) — ganho de perf de graça.

### Fase 4 — Observabilidade & jobs
- Tabela/serviço de **job status** padrão; logs estruturados; registro de envios e de custo/tempo de IA; **rate-limit Upstash**.

### Fase 5 — TypeScript & schema
- Tipos do Supabase (`types/db.ts`); payloads de IA com **Zod**; `noImplicitAny` em módulos novos; reduzir `any` em `lib/auth`, `lib/notifications`, `lib/access-gates`.

---

## 5. Código proposto (trechos-chave)

### 5.0 Hotfix S1 — tenant em update/delete
```ts
// app/admin/empresas/gerenciar/actions.ts
export async function atualizarColaborador(id: string, campos: AtualizarColabInput) {
  const ctx = await requireAdminAction('users.manage');
  const sb = await requireAdminSupabase();
  const { data: existente } = await sb.from('colaboradores').select('empresa_id').eq('id', id).maybeSingle();
  if (!existente) return { success: false, error: 'colab não encontrado' };
  await assertTenantAccess(ctx, existente.empresa_id); // ← FIX: impede cross-tenant
  // ...resto igual
}
```

### 5.1 Factory de action protegida (Fase 2 — mata boilerplate + valida + tenant)
```ts
// lib/auth/protected-action.ts
export function protectedAction<I, O>(
  permission: PermissionKey,
  schema: z.ZodType<I>,
  fn: (ctx: ActionContext, input: I) => Promise<O>,
) {
  return async (raw: unknown): Promise<{ success: true; data: O } | { success: false; error: string }> => {
    try {
      const ctx = await requireAdminAction(permission);
      const input = schema.parse(raw); // validação Zod no contrato
      return { success: true, data: await fn(ctx, input) };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'erro' };
    }
  };
}
```

### 5.2 Serviço de link de acesso (Fase 1 — resolve o bug do "enviado mas não enviado")
```ts
// lib/notifications/access-link-service.ts
export async function sendAccessLink(p: {
  email: string; telefone?: string | null; nome: string; empresaNome: string;
  locale: string; redirectTo: string; nextPath: string; channels: Array<'email' | 'whatsapp'>;
}) {
  const link = await createMagicCallbackLink({ email: p.email, redirectTo: p.redirectTo, nextPath: p.nextPath });
  const out = { email: false, whatsapp: false, link };
  if (p.channels.includes('email')) { /* template + sendHtmlEmail */ out.email = true; }
  if (p.channels.includes('whatsapp') && p.telefone) { /* template + sendWhatsappText */ out.whatsapp = true; }
  return out; // ← retorno EXPLÍCITO por canal (nunca "sucesso silencioso")
}
```

### 5.3 Gate de produto (Fase 1 — regra previsível)
```ts
// lib/access-gates/mapeamento-cenarios.ts
export type GateResult =
  | { allowed: true }
  | { allowed: false; code: string; message: string; remediation?: string };

export function canAccessMapeamentoCenarios(config: EmpresaConfig): GateResult {
  if (config.votacao_ativa) return { allowed: false, code: 'VOTACAO_ATIVA', message: 'Liberado após o fechamento da votação.' };
  if (config.perfil_comportamental_liberado === false) return { allowed: false, code: 'PERFIL_BLOQUEADO', message: 'Perfil ainda não liberado.', remediation: 'Libere o perfil antes dos cenários.' };
  if (config.mapeamento_cenarios_liberado !== true) return { allowed: false, code: 'CENARIOS_BLOQUEADOS', message: 'Cenários ainda não liberados.', remediation: 'Ative mapeamento_cenarios_liberado no painel.' };
  return { allowed: true };
}
```

### 5.4 Paralelização de lote (Fase 3 — ao tocar fase5)
```ts
// antes: for (const colab of colabs) { await callAI(...) }  // ~1250s
const dados = await carregarTudo(empresaId);            // batch-load 1x
await mapPool(colabs, 3, async (colab) => {              // pool concorrente
  const ctx = indexar(dados, colab.id);                 // em memória, sem N+1
  await processar(colab, ctx);
});
```

---

## 6. Critérios de aceite (por fase)
- `npm run typecheck` passa; testes unitários relevantes passam.
- Smoke manual: login magic-link (admin + tenant), dashboard colaborador, assessment/cenários, envio WhatsApp controlado.
- **Nenhum novo `createSupabaseAdmin()` fora da allowlist.**
- Nenhuma mudança funcional intencional sem aprovação.

---

## 7. Prioridade final
1. **Fase 0 — hotfixes S1 + S2 + auditoria de platform_admins** (segurança pontual, ~1 dia).
2. **Fase 1 — serviços de envio + gates** (bugs reais: magic-link silencioso, gate de cenários).
3. **Fase 2 — tenant-safe repos + `protectedAction`** (previne futuros S1; mata boilerplate+validação).
4. **Fase 3 — quebrar god-files** (começando por `fase5`, já paralelizando).
5. **Fase 4 — rate-limit distribuído + observabilidade/jobs.**
6. **Fase 5 — TypeScript gradual + tipos Supabase.**

> O salto de qualidade aqui não é reescrever — é transformar os guard-rails existentes (allowlist, `tenantDb`, testes) em **APIs internas ergonômicas**, para que o caminho seguro seja também o mais fácil.
