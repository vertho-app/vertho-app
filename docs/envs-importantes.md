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
| `NEXT_PUBLIC_SENTRY_DSN` | Error tracking | Não | Produção |
| `NEXT_PUBLIC_APP_URL` | URL base da app | Sim | Produção |
| `RESEND_API_KEY` | Emails (Fase 2) | Sim | Produção |
| `ZAPI_INSTANCE_ID` | WhatsApp Z-API | Sim | Produção |
| `ZAPI_TOKEN` | WhatsApp Z-API | Sim | Produção |
| `ZAPI_CLIENT_TOKEN` | WhatsApp Z-API | Sim | Produção |
| `QSTASH_TOKEN` | Filas async (QStash) | Sim | Produção |
| `QSTASH_CURRENT_SIGNING_KEY` | Verificação webhook | Sim | Produção |
| `QSTASH_NEXT_SIGNING_KEY` | Verificação webhook | Sim | Produção |
| `MOODLE_TOKEN` | Moodle LMS | Não | Produção |
| `MOODLE_URL` | URL Moodle (default: academia.vertho.ai) | Não | Produção |
| `FIRECRAWL_API_KEY` | Scraping fallback | Não | Produção |
| `CRON_SECRET` | Auth cron jobs | Sim | Produção |
| `ADMIN_EMAILS` | Fallback admin (server) | Não | Produção |

## Onde configurar
- **Vercel**: https://vercel.com/rodrigo-2456s-projects/vertho-app/settings/environment-variables
- **Local**: `.env.local` (nunca committar)
