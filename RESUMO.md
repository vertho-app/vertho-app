# Resumo de Retomada — Vertho App

> Atualizado em 14/05/2026 para reinicializacao do PC.

## Onde esta o projeto

- Workspace: `C:\GAS\Vertho App\nextjs-app`
- Branch Git: `master`
- HEAD atual: `b7b072b` — `feat(pulso): envio de convites por WhatsApp/email`
- Stack: Next.js 16.2.4, React 19.2.4, Supabase/Postgres, Tailwind 4, Anthropic/Gemini/Voyage, Vercel.
- Documento detalhado: `ARQUITETURA.md`

## Estado do Git antes do reboot

Arquivos rastreados estavam sem mudancas pendentes antes desta atualizacao de docs.

Nao versionados presentes:

- `.tmp_enem_2024/`
- `outputs/`
- `public/Logo sem texto.png`
- `scripts/diag-tables-check.mjs`

Apos esta atualizacao, os arquivos documentais alterados sao:

- `RESUMO.md`
- `ARQUITETURA.md`

## Como retomar depois de reiniciar

```powershell
cd "C:\GAS\Vertho App\nextjs-app"
git status --short
npm run dev
```

Abrir: `http://localhost:3000`

Comandos uteis:

```powershell
npm run typecheck
npm run test:unit
npm run smoke
npm test
```

## Frente atual do produto

- App principal: Mentor IA multi-tenant em `app.vertho.ai` e subdominios de tenant.
- Publicos: `radar.vertho.ai`, `radarbett.vertho.ai`, `imprensa.vertho.ai`.
- Radar: paginas publicas de escola, municipio, rede, estado, comparacao, metodologia e Bett.
- Radar Bett: home comercial, busca avancada, paginas de escola/municipio, comparacao, jornada, metodologia, tracking de funil e CTA WhatsApp.
- Admin Radar: ingestao, qualidade de dados, funnel geral e funnel Bett.
- Mentor IA: dashboards colaborador/gestor/RH, temporadas 14 semanas (default Regular DUO: 2 competencias em blocos paralelos, missoes integradoras; single-comp via programa_modo=regular_single), votacao por cargo, perfil comportamental, PDI, relatorios e RAG per-tenant.
- **Pulso de Desenvolvimento (novo, mai/2026)**: pesquisa T0/T2 + sinais comportamentais + Dual-IA classifica texto aberto + triangulacao + PDFs Executivo + Complementar NR-1. Multi-tenant. Piloto Macae preparado (59 assignments T0 criados, ciclo fechado).
- **Cliente Macae**: migracao GAS->Supabase concluida (59 colabs, 18 competencias, 51 PDIs migrados via Drive). Samuel Protetti setado como gestor de todos. Telefones limpos sem `+`.

## Banco e migrations

- Migrations atuais: `022` ate `098`.
- Total no workspace: ~79 arquivos SQL.
- Ultimas frentes:
  - `088`: limpeza de telefones.
  - `089`: tracking de dispositivo na votacao.
  - `090-092`: Modo Onboarding (sys_config, multi-competencia, tutorados_ids).
  - `093-095`: Mercado Potencial (MVs, INSE proxy, idade-corte flexivel).
  - `096`: Pulso — tabelas core (ciclos, assignments, responses, audit_logs).
  - `097`: Pulso — MV `pulse_mv_aggregates` + funcao refresh.
  - `098`: Pulso — Dual-IA (classifications, triangulations).

## Pontos de atencao

- RLS existe em varias tabelas, mas boa parte das queries server-side usa `service_role`; a barreira real continua sendo filtro explicito por `empresa_id` e guardas em `lib/auth/action-context.ts`.
- `middleware.js` ainda e o ponto de roteamento por subdominio. Ha nota no proprio arquivo sobre possivel migracao futura para `proxy.ts` se o Next.js exigir.
- Variaveis sensiveis ficam em `.env.local` e Vercel. Nao commitar segredos.
- Artefatos grandes/dados gerados (`outputs/`, `.tmp_enem_2024/`) estao fora do Git neste momento.

## Arquivos mais importantes para navegar

- `app/`: rotas App Router.
- `actions/`: server actions de negocio.
- `lib/radar/`: queries, importadores e IA do Radar.
- `lib/season-engine/`: motor das temporadas.
- `lib/auth/action-context.ts`: guardas de auth para actions.
- `migrations/`: schema Supabase.
- `docs/`: runbooks e auditorias.
- `ARQUITETURA.md`: mapa completo da aplicacao.
