# Checklist de Go-Live — Rollout Controlado

> Revisão: 2026-04-17

## Pré-requisitos de infraestrutura

- [ ] Variáveis de ambiente configuradas no Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ANTHROPIC_API_KEY`
  - `VOYAGE_API_KEY` (embeddings)
  - `RESEND_API_KEY` (emails)
  - `BUNNY_API_KEY` + `BUNNY_LIBRARY_ID` (vídeos)
  - `JINA_API_KEY` (scraping PPP)
  - `CRON_SECRET` (cron jobs)
  - `SENTRY_DSN` (observabilidade)
- [ ] Supabase project ativo (Pro plan recomendado)
- [ ] Migrations aplicadas (022-051) em ordem
- [ ] Storage buckets criados: `avatars`, `relatorios-pdf`, `conteudos`, `backups`
- [ ] SMTP configurado no Supabase (Resend ou equivalente)

## Smoke test — fluxos críticos

### Auth
- [ ] Login funciona (email + senha)
- [ ] Redirect para `/login` quando não autenticado
- [ ] Dashboard carrega após login

### Dashboard colaborador
- [ ] Home carrega KPIs e dados
- [ ] Perfil carrega e permite edição de foto/avatar
- [ ] Perfil comportamental (DISC) carrega se mapeado
- [ ] PDI carrega e gera PDF
- [ ] Jornada carrega fases
- [ ] Evolução carrega relatório se existir

### Assessment / Temporada
- [ ] Assessment carrega cenário do dia
- [ ] Temporada carrega timeline de 14 semanas
- [ ] Chat socrático funciona (semanas de conteúdo)
- [ ] Tira-dúvidas responde dentro do escopo
- [ ] Missão prática (semanas 4/8/12) funciona

### Admin
- [ ] Dashboard admin carrega
- [ ] Empresas listam e abrem
- [ ] Pipeline Fase 1-5 funciona (IA1→IA2→IA3→check)
- [ ] Relatórios geram (individual/gestor/RH)
- [ ] PDFs são gerados e salvos no storage

### Gestor
- [ ] Equipe evolução carrega liderados
- [ ] Checkpoints podem ser salvos
- [ ] Plenária PDF gera

## Diagnóstico rápido de falhas

| Sintoma | Provável causa | Verificar |
|---------|---------------|-----------|
| 401 em tudo | SUPABASE_URL ou ANON_KEY errado | Env vars no Vercel |
| "Não autenticado" em actions | Cookies SSR não sincronizando | @supabase/ssr + createBrowserClient |
| IA retorna erro | ANTHROPIC_API_KEY ausente ou rate limit | Env var + logs Vercel |
| PDF não gera | @react-pdf/renderer ou storage bucket | Logs de erro + bucket permissions |
| Emails não enviam | RESEND_API_KEY ou SMTP Supabase | Configuração SMTP no dashboard |
| Embeddings falham | VOYAGE_API_KEY ausente | Env var |
| Upload falha | Bucket inexistente ou RLS no storage | Criar bucket + policies |

## Rollback

Se produção apresentar erro crítico:
1. Verificar logs no Vercel (Functions tab)
2. Verificar Sentry para erros do lado do servidor
3. Se erro de auth: verificar cookies + env vars
4. Se erro de IA: verificar API key + rate limits
5. Se erro de storage: verificar buckets + policies
6. Rollback: Vercel permite redeploy de commit anterior em 1 clique
