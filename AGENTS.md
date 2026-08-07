# AGENTS.md

## Deploy

- **Sempre faça deploy após ajustes/correções**: commit + push no `master` dispara o deploy automático da Vercel (projeto `vertho-app`). O app em uso é o de produção — correção local que não sobe não resolve o problema do usuário.
- Commite apenas os arquivos da correção (a working tree costuma ter mudanças paralelas do usuário que não devem entrar no commit).
- Antes de commitar, rodar `npm run typecheck` (`tsc --noEmit`).

## Banco de dados (Supabase)

- Projeto remoto: `xwuqrgrvakxtphbmudwj` (produção — não há ambiente local).
- Credenciais em `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- Scripts pontuais de diagnóstico/manutenção: `scripts/_*.mjs` (convenção do repo), usando `@supabase/supabase-js` + `dotenv`.
- Antes de deletar dados em produção, sempre salvar backup JSON em `backups/`.

## Notificações e Web Push (`lib/notifications/`)

> Contexto, medições e decisões: **`docs/APP-MOBILE.md`**. Leia antes de mexer.

**Tabelas** (migs 198/200/201): `notification_deliveries` (uma linha por tentativa,
**qualquer canal** — WhatsApp, e-mail e push), `notification_endpoints` (uma linha por
INSTALAÇÃO, não por pessoa), `notification_optin_events` (funil de adesão).

**Módulos**
- `delivery-log.ts` — `registrarEntrega`, usado por WhatsApp e e-mail. Nunca lança; falha vira degradação.
- `push-core.ts` — `enviarPush`, núcleo **headless** (sem gate; quem chama aplica). Grava a entrega ANTES do envio porque o `id` vai no payload e é ele que o service worker devolve na abertura.
- `providers/webpush.ts` — único adapter com consumidor. 404/410 = inscrição morta → desliga o endpoint.
- `flag.ts` — `pushHabilitado(empresaId)`, **fail-closed**.
- `estado-convite.ts` — decisão pura de qual convite mostrar. **A ordem das checagens é a invariante**: iOS-não-instalado ANTES de suporte a `PushManager` (fora do app instalado o PushManager não existe, e inverter faz o convite sumir no iOS — já aconteceu).
- `access-link-service.ts` — magic link/signup por e-mail e WhatsApp, com status explícito por canal.

**Rotas** (`app/api/notifications/`): `subscriptions`, `subscriptions/disable`, `optin-event`, `opened`.
Todas `requireUser` + `runtime = 'nodejs'`; empresa/colaborador **só da sessão**.

**Regras que não podem ser afrouxadas**
- `public/sw.js` **sem handler de `fetch`** — uma vez registrado, o worker controla `/` inteiro daquele aparelho para sempre. Cache ali serviria app shell velho depois de um deploy, sem erro visível.
- 🔴 **Todo `serviceWorker.register()` declara `scope`.** Sem ele o escopo padrão é o diretório do script — para arquivos na raiz de `public/` isso é `/`, o mesmo do `sw.js`, e registrar outro script no mesmo escopo **substitui** a registration: o push morre em silêncio. Guarda executável: `tests/unit/security/service-worker-scope-guard.test.ts`.
- **Um dono ativo por assinatura**, garantido pelo banco (índice único parcial, mig 205). Fechar só em código não cobre corrida.
- **O logout NÃO desativa push** (decisão registrada em `dashboard-shell.tsx` e no doc). Reverter isso reintroduz "opt-in até você sair" e envenena o denominador do experimento.
- No cron, a flag sai de `empresa.sys_config`, **nunca** de `pushHabilitado()`: aquela função é fail-closed e um erro de leitura viraria "o tenant não ligou push".
- Regra de health nova: a contagem tem que ser **"quem não vai receber"**, nunca "quantas falhas" — `achado()` devolve `null` com contagem 0, e o pior caso costuma produzir zero falhas.
- A flag gateia as **rotas**, não só a renderização. Exceção deliberada: `disable` nunca é gateado (desligar a flag não pode aprisionar quem já ativou).
- `csrfCheck` nas rotas mutativas. Exceção documentada no `opened` (chamada pelo service worker, autenticada por cookie) — ver o comentário no arquivo.
- Ao registrar uma inscrição, endpoints com a **mesma URL de subscription** pertencentes a outro colaborador são desativados: a assinatura pertence ao navegador, não à conta (A → logout → B no mesmo aparelho).
- Envio de e-mail **fora** de `pilula-envio`/`access-link-service` ainda NÃO é medido (`fase2`, `fase5/relatorios-envios`, `pulse/envio`, `radar/lead-pdf`, `conarh/artefato`, `admin/whatsapp`).

**Envs**: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
⚠️ Regenerar o par VAPID invalida **todas** as inscrições existentes.
