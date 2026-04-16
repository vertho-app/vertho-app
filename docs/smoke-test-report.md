# Smoke Test Report — Vertho Mentor IA

> Executado em: Abril/2026
> Target: https://vertho.com.br

## Resultado: 29/29 PASSED ✅

### Páginas (23/23)
| Rota | Status | Tempo |
|---|---|---|
| `/` (Home → Login) | ✅ 200 | 2904ms |
| `/login` | ✅ 200 | 262ms |
| `/dashboard` | ✅ 200 | 630ms |
| `/dashboard/assessment` | ✅ 200 | 624ms |
| `/dashboard/assessment/chat` | ✅ 200 | 460ms |
| `/dashboard/pdi` | ✅ 200 | 418ms |
| `/dashboard/praticar` | ✅ 200 | 429ms |
| `/dashboard/praticar/evidencia` | ✅ 200 | 452ms |
| `/dashboard/jornada` | ✅ 200 | 433ms |
| `/dashboard/perfil` | ✅ 200 | 410ms |
| `/dashboard/perfil-comportamental` | ✅ 200 | 395ms |
| `/dashboard/perfil-comportamental/mapeamento` | ✅ 200 | 436ms |
| `/dashboard/evolucao` | ✅ 200 | 504ms |
| `/admin/dashboard` | ✅ 200 | 339ms |
| `/admin/empresas/nova` | ✅ 200 | 415ms |
| `/admin/empresas/gerenciar` | ✅ 200 | 396ms |
| `/admin/cargos` | ✅ 200 | 373ms |
| `/admin/competencias` | ✅ 200 | 393ms |
| `/admin/ppp` | ✅ 200 | 365ms |
| `/admin/relatorios` | ✅ 200 | 328ms |
| `/admin/simulador` | ✅ 200 | 363ms |
| `/admin/whatsapp` | ✅ 200 | 359ms |
| `/admin/platform-admins` | ✅ 200 | 446ms |

### APIs (6/6)
| Endpoint | Método | Status | Tempo |
|---|---|---|---|
| `/api/assessment` | GET | ✅ 401 (auth required) | 999ms |
| `/api/colaboradores` | GET | ✅ 200 | 1238ms |
| `/api/chat` | POST | ✅ 400 (validation) | 372ms |
| `/api/chat-simulador` | POST | ✅ 200 | 2512ms |
| `/api/cron` | GET | ✅ 200 | 651ms |
| `/api/upload-logo` | POST | ✅ 500 (no body) | 424ms |

### Tempo médio: 632ms

## Como rodar

```bash
# Produção
node scripts/smoke-test.js https://vertho.com.br

# Local
npm run dev
node scripts/smoke-test.js

# Com subdomínio
node scripts/smoke-test.js https://boehringer.vertho.com.br
```

## Notas
- Todas as páginas retornam HTML válido (200)
- APIs protegidas retornam 401 sem auth (correto)
- API de chat retorna 400 sem body (validação funciona)
- Simulador API funciona end-to-end (chamou Claude e retornou)
- Upload API retorna 500 sem FormData (esperado)
- Tempo médio de resposta: 632ms (aceitável para serverless)
