# Variáveis de Ambiente — Mapa

> SEM valores secretos. Apenas referência operacional.

| Variável | Uso | Obrigatória | Ambiente |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Conexão Supabase (client) | Sim | Todas |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + RLS (client) | Sim | Todas |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS (server only) | Sim | Produção |
| `ANTHROPIC_API_KEY` | Claude (IA principal) | Sim | Produção |
| `GEMINI_API_KEY` | Gemini (auditoria) | Sim | Produção |
| `OPENAI_API_KEY` | GPT (opcional) | Não | Produção |
| `AI_FALLBACK_MODEL` | Fallback central de IA (Claude down → OpenAI; default gpt-5.4) | Não | Produção |
| `OPENAI_FALLBACK_MODEL` | ⚠️ Fallback do RADAR só (`lib/radar/*`) — NÃO o central | Não | Produção |
| `EMBEDDING_PROVIDER` | Provider de embeddings/RAG: `openai`\|`voyage`\|`none` (prod=voyage; none→FTS) | Não | Produção |
| `VOYAGE_API_KEY` | Embeddings Voyage (quando `EMBEDDING_PROVIDER=voyage`) | Não | Produção |
| `TTS_BACKEND` | TTS do podcast: `aistudio` (GEMINI_API_KEY, teto 100/dia) ou `vertex` (cota alta) | Não | Produção |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | SA (base64) do Vertex — ⚠️ OBRIGATÓRIA no Vercel se `TTS_BACKEND=vertex` | Não | Produção/Trigger |
| `NEXT_PUBLIC_SENTRY_DSN` | Error tracking (chave pública, inlined no build) | Não | Produção |
| `NEXT_PUBLIC_APP_URL` | URL base da app | Sim | Produção |
| `RESEND_API_KEY` | Emails (Fase 2) | Sim | Produção |
| `ZAPI_INSTANCE_ID` | WhatsApp Z-API | Sim | Produção |
| `ZAPI_TOKEN` | WhatsApp Z-API | Sim | Produção |
| `ZAPI_CLIENT_TOKEN` | WhatsApp Z-API | Sim | Produção |
| `ZAPI_WEBHOOK_SECRET` | Proteção do webhook de desconexão Z-API | Sim | Produção |
| `QSTASH_TOKEN` | Filas async (QStash) | Sim | Produção |
| `QSTASH_CURRENT_SIGNING_KEY` | Verificação webhook | Sim | Produção |
| `QSTASH_NEXT_SIGNING_KEY` | Verificação webhook | Sim | Produção |
| `MOODLE_TOKEN` | Moodle LMS | Não | Produção |
| `MOODLE_URL` | URL Moodle (default: academia.vertho.ai) | Não | Produção |
| `FIRECRAWL_API_KEY` | Scraping fallback (quando Jina falha) | Não | Produção |
| `BUNNY_STREAM_API_KEY` | Bunny Stream (upload/playback de vídeo) | Sim | Produção |
| `BUNNY_WEBHOOK_SECRET` | Proteção do webhook de status Bunny (via `?token=` na URL) | Não | Produção |
| `WASENDER_API_KEY` | Failover WhatsApp (backup do Z-API) — ⚠️ chave da **SESSÃO**, não o token de conta (ver nota) | Não | Produção |
| `WASENDER_ACCOUNT_TOKEN` | Token de CONTA WaSender (gerência de sessões via API; o app NÃO lê) | Não | Local |
| `WASENDER_BASE_URL` | Override do host WaSender (default `https://www.wasenderapi.com`) | Não | — |
| `WHATSAPP_PRIMARY` | Provedor primário do failover: `zapi` (default) \| `wasender` | Não | Produção |
| `INTERNAL_API_KEY` | Auth de chamadas internas server-to-server | Não | Produção |
| `INTERNAL_DISPATCH_SECRET` | Segredo de dispatch interno (after/QStash) | Sim | Produção |
| `CRON_SECRET` | Auth cron jobs (⚠️ sem espaço/newline — ver nota) | Sim | Produção |
| `ADMIN_EMAILS` | Fallback admin (server) | Não | Produção |

## Onde configurar
- **Vercel**: https://vercel.com/rodrigo-2456s-projects/vertho-app/settings/environment-variables
- **Local**: `.env.local` (nunca committar)

## Notas / pegadinhas (auditoria 14/07/2026)
- **`CRON_SECRET` não pode ter whitespace.** O Vercel usa como HTTP header do cron e
  **rejeita a build inteira** se houver espaço/newline no valor. Ao setar via CLI use
  `printf '%s' "$(gerador)"` — **nunca** `echo`/`console.log` piped (injetam `\n`).
- **`AI_FALLBACK_MODEL` ≠ `OPENAI_FALLBACK_MODEL`.** O primeiro é o fallback do pipeline
  central (`actions/ai-client.ts`); o segundo é knob **exclusiva do Radar** (`lib/radar/*`).
  Por muito tempo só `OPENAI_FALLBACK_MODEL` existia no Vercel → o central ignorava e usava
  o hardcode `gpt-5.4`. Agora `AI_FALLBACK_MODEL=gpt-5.4` explícito.
- **Sentry ficou DARK de 26/05 a 14/07:** todo o SDK estava instrumentado, mas
  `NEXT_PUBLIC_SENTRY_DSN` nunca foi setado → `Sentry.init({dsn: undefined})` = no-op.
  Ligado em 14/07. DSN é chave **pública** (`NEXT_PUBLIC_*`), inlined no build → mudar exige rebuild.
- **Endpoints fail-closed (503 sem o segredo, em prod):** `/api/cron` (`CRON_SECRET`),
  `/api/webhooks/bunny` (`BUNNY_WEBHOOK_SECRET`). Ausência ⇒ o fluxo silenciosamente para.
- **Preview ≠ Production:** falta `NEXT_PUBLIC_APP_URL` no Preview → cai no default
  `app.vertho.ai` (risco de link/callback de preview apontar pra prod).
- **Vertex TTS no Vercel exige `GOOGLE_SERVICE_ACCOUNT_JSON` (15/07).** O podcast roda TTS
  no runtime da Vercel (`/api/conteudo/{id}/podcast`); com `TTS_BACKEND=vertex` e sem a SA →
  500 "GOOGLE_SERVICE_ACCOUNT_JSON não definido". A SA estava só no Trigger.dev — precisou ir
  pro Vercel. AI Studio tem teto 100/dia (preview) → Vertex é o de volume.
- **WaSender tem DOIS níveis de chave (21/07).** O token de CONTA (formato `NNNN|...`, do
  painel) só serve pra API de gerência (`/api/whatsapp-sessions`); a chave que o adapter
  (`lib/whatsapp/providers/wasender.ts`) usa é a **`api_key` da SESSÃO**, que só existe
  depois de criar a sessão e conectar um número via QR. Com o token de conta no
  `WASENDER_API_KEY`, o health devolve 401 "Session not found" e o failover fica morto.
  O número da sessão WaSender deve ser **DIFERENTE** do número do Z-API (duas APIs de QR
  no mesmo número brigam pela sessão).
- **Web Push / VAPID (05/08).** Três vars, as três nos 3 ambientes da Vercel:
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (pública, **inlined no build** → trocar exige rebuild),
  `VAPID_PRIVATE_KEY` (só na Vercel, nunca no git) e `VAPID_SUBJECT`
  (`mailto:` de contato, exigido pelo protocolo). Gerar com
  `npx web-push generate-vapid-keys`. Sem elas, `webPushConfigurado()` devolve false e
  `enviarPush` retorna sem enviar — **falha silenciosa do ponto de vista do usuário**,
  visível só no campo `motivo` do resultado.
  ⚠️ **Regenerar o par invalida TODAS as inscrições existentes**: cada pessoa teria que
  reativar as notificações no aparelho. Não é rotação transparente — trate como migração.
