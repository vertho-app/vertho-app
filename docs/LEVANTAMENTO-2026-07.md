# Levantamento detalhado do app — 17/07/2026

Auditoria **estática** do código (fluxos, UX, segurança, arquitetura/dados), feita por leitura de código + inspeção do build local. Tudo foi conferido no código, não só nos docs — divergências doc×código estão sinalizadas. Não foram testados endpoints em produção nem rodada a suíte.

## 1. O que é o app

Plataforma multi-tenant (subdomínio `*.vertho.ai`) de desenvolvimento de competências com IA: diagnóstico DISC → assessment por cenários → PDI → "Temporadas" de duração variável (até 14 semanas no programa regular) com microlearning em vídeo personalizado → fechamento com arguição e Evolution Report.

- **Stack**: Next.js 16 (App Router) + TypeScript, Supabase (acesso server-side predominantemente por service-role), Claude como LLM principal com roteamento/fallback também para OpenAI e Gemini, Trigger.dev p/ jobs, Bunny/HeyGen/Remotion p/ vídeo, WhatsApp (Z-API/WaSender) e Resend como canais, QStash p/ filas, Sentry p/ erros. A contagem de “arquivos TypeScript” depende do escopo de diretórios e extensões e, por isso, não é usada como métrica fechada.
- **Escala do código**: 129 `page.tsx`, 39 API route handlers, 449 server action ids no manifest do build (aprox. 417 referenciados nos chunks do cliente; a métrica varia conforme o critério), 161 migrations (~93 tabelas na baseline).

## 2. Fluxos

**Atores**: `colaborador/gestor/rh/tutor` (por tenant, coluna `colaboradores.role`), `platform_admin` (staff, tabela própria), `representante` (canal comercial, `sales_representatives`), anônimo (radar público, proposta por token).

### 2.1 Auth e onboarding

- Login (`/login`) com 3 modos: **magic link** (e-mail ou WhatsApp, via `admin.generateLink` + Resend/WhatsApp), **OTP de 6 dígitos** por WhatsApp (5 tentativas, pepper dedicado), **senha** opcional. Callback único em `app/auth/callback/route.ts` (`verifyOtp` + `exchangeCodeForSession`).
- Colaborador novo entra via **criação manual no admin**, **import CSV** (`actions/onboarding.ts:56`, dedup por e-mail) ou API de colaboradores. O acesso inicial normalmente é provisionado por link; senha não é criada no cadastro e permanece opcional. O login também admite OTP por WhatsApp quando houver telefone elegível.
- Auto-cadastro se o tenant ligar `allow_open_signup` (`app/api/auth/signup/route.ts`).

### 2.2 Colaborador (`/dashboard`)

Jornada em 5 fases canônicas com CTA único na home (`app/dashboard/page.tsx:157-174`); a votação funciona como gate intermediário e por isso aparece separada na sequência abaixo:

1. **F1 DISC + preferências de aprendizagem** (`/dashboard/perfil-comportamental/mapeamento`) — quiz de ranking forçado; grava colunas `comp_*`/`lid_*` e prefs de formato; resultado com PDF e devolutiva em áudio/WhatsApp.
2. **Gate de votação** (`/dashboard/votacao`) — ranking de competências + sugestão; gates controlados pelo admin.
3. **F2 Assessment** (`/dashboard/assessment`) — competências do Top 5 sem limite diário no código atual, perguntas P1–P4 com input por voz; IA4 avalia. Chat socrático legado em `/api/chat` (Claude avaliador + Gemini validador, máx 10 turnos).
4. **F3 PDI** (`/dashboard/pdi`) — relatório com níveis por competência, PDF próprio.
5. **F4 Temporada** (`/dashboard/temporada`) — duração e carga dependem do modo: regular DUO (14 semanas, 2 competências), regular single (14 semanas, 1 competência), onboarding (10 semanas, 5 competências) e piloto reduzido. Há gating por data; semana com conteúdos por formato (vídeo Bunny resolvido ao vivo), desafio, evidências (chat socrático), tira-dúvidas (exige conteúdo consumido) e missões práticas conforme o programa. No fechamento: Cenário B + arguição oral (até 8 turnos no regular/DUO, 6 no onboarding e 4 no piloto) + scorer + 2ª IA + Evolution Report (`/api/temporada/evaluation`).
6. **F5 Evolução** (`/dashboard/evolucao`) — deltas, relatório, PDF.
- Transversais: pulso (questionários Likert com aviso de privacidade), gestor (checkpoints, ranking de adequação, seleção com DISC de candidatos, plenária em PDF).

### 2.3 Admin (`/admin`) — ~73 páginas

- **Visão geral**: dashboard KPIs cross-tenant; gerenciar empresas (CRUD colaboradores/cargos, import CSV, export XLSX).
- **Pipeline do tenant** (`/admin/empresas/[id]`): hub de fases (fase0 setup → IA1 top10 → IA2 gabaritos → disparos → relatórios/ranking/seleção/votação/pulso/config) + **danger zone** que limpa tabelas por tipo.
- **Operação**: temporadas (gerar/pausar/regerar semana, simulador), engajamento, disparos WhatsApp em lote com editor de template.
- **Configuração**: competências por cargo, cargos (workspace top10/gabarito), PPP escolar.
- **Conteúdo**: banco de microlearning, kits semanais (Trigger.dev + polling `kit_jobs`), stats Bunny (heatmap, inatividade), knowledge-base RAG, módulos-base (manuscrito/vídeo).
- **Resultados**: perfis DISC, relatórios em lote, fit v2 (calibração, ranking), Evolution Reports.
- **Auditoria interna**: evidências socráticas, workspace de auditoria sem13+sem14, grid de descritores.
- **Dados educacionais**: ingestão Radar (ICA/FUNDEB/PDDE/VAAR por upload), qualidade de dados, funis de leads.
- **Comercial/custos/sistema**: canal de representantes, RadarEmpresas (Receita/CAGED/RAIS), mercado potencial, simulador de custo de IA, orçamento, simulador de fluxos, platform-admins, permissões (RBAC granular + overrides auditáveis), auditoria (`admin_audit_log`), lixeira, reset demo.

### 2.4 Representante (`/representante`) + proposta pública

Dashboard com pipeline kanban e comissão estimada; carteira; CRM de oportunidades; **propostas** com editor assistido por IA e link público por token de 144 bits (VM sanitizado, sem comissão/margem — `getPropostaPublica`); comissões (ledger, NF); inteligência comercial (materiais, benchmark, assistente de objeções com IA); acesso ao tenant demo como persona allowlistada. `/proposta/[token]` é público, com PDF.

### 2.5 Radar educacional público

`radar.vertho.ai` sem login: home com busca, páginas por escola/município/estado/rede (Saeb/Ideb/ICA/Censo/FUNDEB/PDDE), comparador, metodologia. SEO completo (metadata/OG, sitemap dinâmico em chunks). Captura de lead com PDF por e-mail via QStash. `app/radarbett/*` existe no código mas o subdomínio foi descontinuado (301) — **código dormant, ainda servível por path**.

### 2.6 Fluxos implícitos

- **4 crons Vercel** (`vercel.json`): `cleanup_sessoes` (05:00 UTC), `backup_diario` (04:00), `reset_demo` (07:00), `trigger_diario` (11:00 — motor único de cadência: pílulas WhatsApp/e-mail, nudges de evidência). Protegidos por `CRON_SECRET`, fail-closed.
- **WhatsApp em massa**: fila QStash → webhook com verificação de assinatura, idempotente (`envios_diagnostico.status`), 503 para retry se nenhum provedor entregar.
- **Pipeline de vídeo**: geração personalizada por colaborador (saudação com nome) → Trigger.dev (HeyGen avatar + TTS Gemini + Whisper align) → render Remotion em **worker Hetzner efêmero** (fila com claim atômico, fan-out, self-destruct no ócio) → upload Bunny.

### 2.7 Lacunas de fluxo

1. **Link CIS quebrado** — `actions/fase2.ts:101` e `actions/whatsapp-lote.ts:71` geram `/avaliacao/{token}`, mas **não existe `app/avaliacao/`** nem redirect; nada consome `envios_diagnostico.token`. A tela `/admin/whatsapp` segue oferecendo o disparo. **Convites de avaliação caem em 404** — bug mais concreto do levantamento.
2. Rotas vazias: `app/simulador-consultor/` e `app/inicio/` (diretórios sem arquivos).
3. `radarbett` dormant mas servível por path no domínio do app.
4. Doc do assessment diz "1 competência/dia", mas o limite foi removido do código (`assessment-actions.ts:120`).
5. Onboarding depende de passos manuais espalhados (importar → gates → disparar links); sem wizard único.

## 3. UX

### Pontos fortes

- **Tokens de design sérios** (`app/globals.css:19-166`): paleta, radius, sombras com comentários normativos; Tailwind 4.
- **White-label real** por tenant: ramp `brand-*` derivada de 1 cor via `color-mix` (`app/dashboard/dashboard-shell.tsx:25-37`); tokens de fase (`--phase-accent`).
- **Responsividade difundida** (classes `sm:`/`md:` em 114 arquivos; 3 shells com estratégias mobile adequadas: bottom-nav no dashboard, drawers no admin/representante).
- **Feedback**: sonner em 51 arquivos; `confirm-dialog` com boa base de acessibilidade no admin (3 severidades, confirmação digitada, ESC e foco inicial), mas sem focus trap/restauração completa de foco.
- **i18n real** em 4 locales (pt-BR/pt-PT/es-ES/en-US) com cascata cookie → tenant → Accept-Language; scripts `i18n:audit`/`i18n:check`.
- Acessibilidade parcial mas presente nos componentes-base: `aria-busy` no Button, `role=status/alert` no async-state, `role=alertdialog` no confirm-dialog, drawer mobile com ESC e scroll-lock.

### Fraquezas (por impacto)

1. **Estados de interface quase inexistentes**: **2 `loading.tsx` para 129 páginas**; 6 `error.tsx` (representante, radar e proposta sem nenhum); `components/ui/async-state.tsx` é bom e tem `aria-live`, mas **não tem uso efetivo encontrado** (apenas reexport no barrel); `components/empty-state.tsx` tem **zero imports** (código morto).
2. **i18n parcial, sem percentual confiável**: radar (8 páginas), radarbett (7) e representante (12) são majoritariamente pt-BR hardcoded; en-US está 9 chaves atrás; `mic-input` é fixo em pt-BR; "Voltar" está hardcoded em `page-shell.tsx:32`. O audit atual encontra candidatos em prompts, comentários e mensagens server-side e não serve como denominador de cobertura.
3. **Acessibilidade superficial**: `focus-visible` em só 2 arquivos; não foi encontrado focus trap nos modais inspecionados; há combinações `white/40-50` sobre navy que exigem medição de contraste renderizado, especialmente labels de 10px e placeholders; gráficos de dados em SVG não têm nome acessível/alternativa textual; `beto-chat` não tem `aria-live` (leitor de tela não anuncia respostas da IA) e o FAB não tem `aria-label` explícito.
4. **Design system de componentes aspiracional**: `page-shell` em 11 de 129 páginas (só dashboard); admin tem padrão próprio (AdminPageHeader, 13/73); duas tipografias de título coexistem.
5. **Bugs pontuais**: **`<Toaster>` duplicado em `/representante`** (root layout + `representative-shell.tsx:259` → toasts em dobro); mini-renderer Markdown próprio no BetoChat apesar de `react-markdown` instalado; **nenhum streaming em nenhum chat de IA** (zero `text/event-stream`/`ReadableStream` — tudo request/response com spinner); máscaras de input pouco adotadas; validação de formulário mínima (login valida só `includes('@')` no cliente, embora a rota server-side seja mais restritiva); zod concentrado no servidor.
6. **Gráficos SVG/CSS artesanais** (sem lib): funcionais e escaláveis por `viewBox` + largura fluida — o W=720 é o sistema interno de coordenadas, não falta de responsividade —, mas sem tooltips, nome acessível ou alternativa textual.
7. Doc `DESIGN-SYSTEM.md` desatualizada: diz "Inter única"; o layout raiz carrega 5 famílias no total, das quais Plus Jakarta Sans e Fraunces sustentam o sistema específico do RadarBett.

## 4. Segurança

Postura **madura e autoconsciente**: gates server-side centralizados (`requireUser/requireRole/requireAdmin/requirePermission` + `assertTenantAccess/assertColabAccess`), CSRF por Origin em 10 rotas mutativas, webhooks com segredo timing-safe e fail-closed, crons com `CRON_SECRET`, uploads com allowlist de formato e path prefixado por empresa, guards de CI testados contra o build (com canário anti-guard-cego). As 4 classes críticas da auditoria de 03/07 (RCE `exec_sql`, RLS permissiva, IDORs, path-traversal) estão **confirmadas fechadas** (migrations 155–158). **Nenhum exploit crítico adicional foi identificado nesta revisão estática** — isso não prova ausência em runtime/produção.

### Alto

> **✅ FECHADOS em 22/07/2026** — os 3 achados abaixo estao corrigidos; ficam
> registrados como historico. Ver `docs/SECURITY-STATUS.md` › "Fechamento dos
> altos 22/07" para a correcao de cada um.

1. **Enumeração + download anônimo de vídeos** — `app/api/bunny-videos/route.ts:29` lista os 50 vídeos recentes sem auth (GUID + título); `app/api/video-download/[videoId]/route.ts:51-91` baixa o MP4 sem auth. Os pipelines Trigger e Hetzner enviam vídeos personalizados para a mesma `BUNNY_LIBRARY_ID`, com o primeiro nome no título (`${nome} · ${videoId}`): há PII nominal enumerável e conteúdo personalizado potencialmente baixável anonimamente.
2. **`x-tenant-slug` forjável fora de subdomínios** — `proxy.js:153` retorna `NextResponse.next()` **sem remover** o header no apex/`*.vercel.app`; `lib/tenant-resolver.ts:48-53` confia cegamente. Consequência: enumeração de e-mails de qualquer tenant (`check-email/route.ts:56-64`), signup em tenant alheio se `allow_open_signup` (`signup/route.ts:50-91`), OTP/magic-link fora de contexto. O cookie `vertho-tenant-slug` tem **precedência** em `findColabByEmail` (`lib/authz.ts:21-30`) e pode estar stale ou ser enviado por um cliente HTTP; por ser `HttpOnly`, não é diretamente alterável por JavaScript comum do navegador.
3. **Open redirect de token de sessão** — `app/api/auth/phone-otp/verify/route.ts:87-111` aceita `redirectTo` do cliente e monta `callbackUrl` com `token_hash` em domínio arbitrário. As rotas irmãs usam `resolveSafeAuthRedirect` com allowlist de host (`lib/auth/redirect.ts:23-35`); esta não.

### Médio

4. `enviarWhatsApp`/`enviarAudio` com bypass `internal` **boolean, sem revalidação de tenant** (`actions/whatsapp.ts:23,44`) — hoje não explorável (id fora do bundle), **proteção acidental** monitorada por CI; um import num client component vira relay de WhatsApp sem sessão. (Resíduo `internal` real hoje: 5 entradas, não 8 como diz o CLAUDE.md.)
5. **Leitura cross-tenant** em `app/api/capacitacao-recomendada/route.ts:29-45` — sem o param `empresa_id`, retorna `micro_conteudos` de todos os tenants a qualquer autenticado.
6. **Chaves de IA por tenant em plaintext** em `empresas.sys_config.ai` (`configuracoes/page.tsx:658-670`), devolvidas ao browser da tela autorizada de administração da plataforma por `loadConfig` — e **nenhum código as consome** (só `modelo_padrao`/`modelos` são lidos). Segredo guardado sem finalidade e desnecessariamente exposto ao runtime do browser administrativo.
7. **Isolamento multi-tenant predominantemente por código**: 297 usos de service-role em 129 arquivos; a allowlist de leituras raw contém 39 arquivos e 54 ocorrências. Guards de CI veem que **há** filtro, não que o **valor** é o tenant certo (limitação admitida). Há caminhos específicos por cliente/RLS, portanto “100%” seria impreciso.
8. **Rate limit in-memory por Lambda** (`lib/rate-limit.ts`) — teto ×N instâncias; documentado, não migrado.
9. Rotas `internal/*` preferem `INTERNAL_API_KEY`, mas mantêm a **própria service-role key** como fallback de segredo de rede (`internal/modulo-from-video/route.ts:24-25`); `OTP_PEPPER` também cai no service-role se ausente.
10. **Server Actions sem token CSRF explícito da aplicação**: o Next usa POST e compara `Origin` com `Host`/`X-Forwarded-Host` por padrão ([documentação oficial](https://nextjs.org/docs/app/guides/data-security)). O risco é depender da proteção do framework sem uma auditoria específica de proxy/`allowedOrigins` e, sobretudo, deixar autenticação/autorização ausente em alguma action — toda action publicada deve ser tratada como endpoint público.

### Baixo

11. `getPropostaPublica` publicada no bundle com **escrita** (`view_count++`) sem rate-limit nem sessão (`actions/sales/proposal-share.ts:60-65`) — risco baixo de inflação do contador/write amplification, não de descoberta prática do token de 144 bits.
12. Áudio personalizado de podcast (nome em áudio) servido por URL construída com `getPublicUrl` (`conteudo/[id]/podcast/route.ts:86-101`). O código pressupõe acesso público, mas a ACL real do bucket não é comprovável pelo repositório: **confirmar configuração do bucket** antes de classificar como exposição efetiva.
13. `requireAdminOrCronAction` compara segredo com `===` (não timing-safe) em `lib/auth/action-context.ts:56`.
14. `app/api/assessment/route.ts:38,91` usa `.eq('email').single()` fora do padrão `findColabByEmail` (quebra com e-mail em 2+ empresas — fail-closed acidental); é principalmente bug de consistência/disponibilidade, não de confidencialidade.
15. CSP só com `frame-ancestors` — sem `script-src`/`style-src` (`next.config.mjs:88-102`). HSTS preload, nosniff, X-Frame-Options OK.
16. Demo guard (`lib/demo/envio-guard.ts:31-34`) é **fail-open** em erro de leitura (proteção final = personas `*.demo@vertho.ai` sem telefone).
17. **LGPD**: retenção/anonimização (transcripts 18 meses, anonimização 24 meses) **sem implementação encontrada** — só `cleanup_sessoes`. DPO placeholder, `admin_access_log` planejado, MFA de admins planejado e template de DPA com clientes pendente; a própria política afirma que DPAs de alguns fornecedores já existem, sem verificação externa nesta revisão. Sem mecanismo self-service de portabilidade **ou exclusão**: a lixeira é administrativa e o perfil não oferece encerramento da conta.
18. **Docs de segurança desatualizados**: SECURITY-STATUS diz 91/168 service-role (real atual: 129 arquivos/297 ocorrências) e "8 entradas internal" (real: 5); `HISTORICO-AUDITORIAS.md` (Abr/2026) obsoleto inteiro; `lgpd-politica.md` §8 desalinhado.

### O que está bom (não mexer)

- Autorização e acesso protegido predominantemente verificados no servidor; `findColabByEmail` fail-closed em ambiguidade; RBAC granular (27 permissões); gates de layout em `/admin` e `/representante`.
- Uploads (signed-url, logo): CSRF + role + limiter + allowlist + path sanitizado.
- Webhooks (bunny/zapi/qstash/radar-lead): segredo obrigatório, timing-safe, fail-closed em prod.
- Nenhum segredo commitado; `NEXT_PUBLIC_*` limpo; `.env.local` gitignored.

## 5. Dados, integrações e operação

### Dados

- 161 migrations (`000-baseline` + 022–180), aplicadas no fluxo ativo por **script Node + driver `pg`** + `NOTIFY pgrst`. `supabase db push` aparece em documentação como fluxo futuro/staging, mas não faz parte do processo ativo atual. Checklist exige idempotência.
- Domínios: core multi-tenant/assessment, fit/scoring, temporadas, radar educacional (`diag_*`, 054–086), RadarEmpresas (~30 tabelas, 099–111), pulse, vídeo/conteúdo, comercial (159–168), governança (RLS, auditoria, ledger de IA 177–178).
- `tenantDb(empresaId)` = Proxy que injeta `.eq('empresa_id')` em select/update/delete e `empresa_id` em insert/upsert; RPCs, auth/storage e o escape hatch `raw` ficam fora dessa proteção.
- Motores de domínio bem isolados: `lib/scoring/engine.ts` (puro, determinístico, `spec_version` congela histórico), `lib/season-engine/` (build, fechamento-scorer, arguição, trava de piloto, week-gating).
- **Armadilha arquitetural documentada**: o gravado ≠ o entregue — vídeo e desafio de kit são compostos na **leitura** (`overlayKitNaSemana`, `resolverCelulaVideo`); diagnóstico/FMEA interno registra vazamento de DISC em produção (23/648 entregas), número histórico não recontado nesta revisão. Ao investigar entrega: "quem lê isso?", nunca apenas "o que está gravado?".

### IA

- Wrapper único `actions/ai-client.ts`: retry com backoff (429/503/529), **fallback de provedor** Claude→`gpt-5.4`, timeout 120s, prompt caching (system >4000 chars + `cachedUserPrefix`), history caching gated por flag.
- **Ledger de custo por chamada** (`ia_usage_log`: feature/modelo/tokens/cache/custo/latência) + RPC de resumo — raro e bom. Catálogo de preços próprio.
- **Batch API Anthropic (−50%)** com collector estilo DataLoader e **fallback síncrono por request** — degrada de forma controlada, embora o fallback também possa falhar.
- Catálogo interno declara 65 prompts (48 ativos), mas isso não equivale a uma contagem atual de ocorrências no código. Modelos em uso incluem Sonnet 4.6, Opus em tarefas de roteiro, Gemini Flash-lite em auditoria/classificação e modelos OpenAI em tarefas críticas/fallback; a rota de tira-dúvidas inspecionada usa Sonnet 4.6, não Haiku.
- Modelo estimativo de custo documentado: `fixo $198 + $3,07×N`; chat = 61% do variável. É hipótese de planejamento/catálogo, não medição operacional refeita nesta revisão.

### Jobs

- **Trigger.dev v4**: 10 tasks (vídeo, kit, IA2/blueprint batch, extração de vídeo, manuscrito, acumulada-piloto), **nenhuma agendada**, **deploy manual** (risco de drift código↔tasks).
- **Cron Vercel**: 4 diários (ver 2.6). **QStash**: WhatsApp em massa com retry por 503 e idempotência.
- `after()` usado em só 3 arquivos, com 6 chamadas efetivas (trabalho pesado vai majoritariamente para Trigger + coluna de status).

### Integrações — pontos de atenção

| Integração | Situação |
|---|---|
| WhatsApp (Z-API/WaSender) | **QR/não-oficial** — failover cobre queda de fornecedor, não bloqueio da conta. Documentado como inviável a 50k usuários (0,5 msg/s = 55h/semana), com risco elevado de ban e baixa previsibilidade operacional. Cloud API oficial **não implementada** |
| HeyGen | O código usa `/v2/video/generate` + `/v1/video_status.get`; o [suporte legado](https://movio-api.readme.io/page/heygen-api-v3-migration-guide) vai até **31/10/2026**. Na [tabela oficial do v3](https://developers.heygen.com/docs/pricing), Photo Avatar III custa hoje US$0,0433/s e Avatar IV (default) US$0,05/s; o “~2,5×” depende da comparação com o custo legado medido internamente. Decisão de engine/custo pendente |
| Supabase | **Concentração central de dependência** — app, trigger, worker Hetzner e backup usam o mesmo projeto; o serviço gerenciado pode ter redundância interna, mas a aplicação não tem caminho alternativo |
| Anthropic/OpenAI/Gemini | bem protegidas (retry, fallback, ledger) |
| Bunny/HeyGen/Remotion-Hetzner | pipeline resiliente (fila atômica, workers efêmeros); webhook Bunny persiste evento, mas não orquestra readiness/continuação do pipeline |
| Resend | comportamento varia por fluxo: serviços novos retornam `skipped`/erro explícito quando falta env; alguns caminhos legados apenas deixam de enviar |
| Embeddings/RAG | default `none` → cai em FTS sem quebrar |

### Operação

- **Backup**: app faz dump JSON gzip de **21 tabelas hardcoded** (retenção 7 dias, cron diário) — `diag_*`, `radarempresas_*`, `pulse_*`, vídeos e `ia_usage_log` **ficam de fora**. Runbook declara RPO 1h/RTO 4h com dump semanal via `scripts/backup-weekly.sh` marcado "TODO criar" — **não existe**. Mesmo um dump semanal isolado não sustentaria RPO de 1h; o SLA depende de PITR/backup gerenciado e teste periódico de restauração.
- **Demo**: tenant `acme-demo` com reset diário (cron + manual, auditado) e guard de envio (fail-open, ver 4.16).
- **Observabilidade**: Sentry 10 (sample 10%, **scrub de PII** em `beforeSend`), auditoria admin com IP/UA, métricas de IA, logs com prefixos grep-áveis.
- **Escala** (doc ESCALA-50K): conteúdo/vídeo reusados por célula (não escalam com usuários); gargalos por pessoa: WhatsApp 🔴, chat IA 🟡, Postgres 🟡 (2 otimizações feitas). São projeções arquiteturais documentadas, não resultado de teste de carga nesta revisão.

## 6. Prioridades sugeridas

1. **Fechar imediatamente os 3 achados altos de segurança**: auth/escopo nas rotas de vídeo Bunny; strip/validação do `x-tenant-slug` no proxy; allowlist de host no `phone-otp/verify`.
2. **Corrigir o link CIS quebrado** (`/avaliacao/{token}`) — convite é a porta de entrada do produto.
3. **Fechar os médios mais concretos**: leitura cross-tenant de capacitação, remoção das chaves de IA em plaintext sem consumidor e eliminação do bypass `internal` boolean/fallbacks desnecessários.
4. **Riscos operacionais com prazo**: migração WhatsApp → Cloud API oficial; decisão e migração HeyGen v3 até 31/10/2026; alinhar backup/PITR/teste de restore ao RPO/RTO prometido.
5. **UX**: generalizar `loading.tsx`/`error.tsx`; matar o Toaster duplicado; decidir o escopo real do i18n (traduzir radar/representante ou declarar pt-BR only); foco visível, focus trap e alternativas acessíveis para gráficos/chats.
6. **Governança de docs e métricas**: atualizar SECURITY-STATUS (129/297, 5 entradas), CLAUDE.md, DESIGN-SYSTEM.md e lgpd-politica.md; automatizar as contagens para evitar novo drift; criar a rotina de backup compatível com o SLA ou ajustar o runbook.

---

*Método: leitura estática de código + inspeção do build local (`.next/`), por 4 frentes (fluxos, UX, segurança, arquitetura), com validação pontual em documentação oficial do Next.js e da HeyGen. Não foram testados endpoints em produção nem rodada a suíte. Há 85 arquivos `.test`/`.spec` no repositório (68 unitários e 17 não unitários); o CI de typecheck está em `typecheck.yml`.*
