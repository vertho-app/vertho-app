# Resumo de Retomada — Vertho App

> Atualizado em 27/05/2026.

## Onde esta o projeto

- Workspace: `C:\GAS\Vertho App\nextjs-app`
- Branch Git: `master`
- HEAD atual: `7108803` — `test(e2e): nível 3 — uma jornada por página`
- Stack: Next.js 16.2.4, React 19.2.4, Supabase/Postgres, Tailwind 4, Anthropic/Gemini/Voyage, Vercel.
- Documento detalhado: `ARQUITETURA.md` (ver secao 1.1 para o estado mais recente).
- **Deploy**: `git push origin master` ja deploya em producao (integracao Git da Vercel). NAO rodar `vercel --prod` por cima (duplica).

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
# Diagnostico E2E nivel 3 (sandbox, sem custo):
$env:SMOKE_EMAIL="..."; $env:SMOKE_PASS="..."; $env:PLAYWRIGHT_BASE_URL="https://teste-piloto.vertho.ai"; $env:DIAG_EMPRESA_ID="<uuid>"; npx playwright test --project=nivel3
```

## Frentes recentes (27/05/2026)

- **Video de instrucoes no mapeamento DISC** (capa clicavel → VideoModal com tracking) + `/api/bunny-thumb` resolvendo `thumbnailFileName`.
- **Botao "Voltar" padronizado** (`components/back-button.tsx`, topo-direito) em ~55 telas; **admin mobile** (drawer `AdminMobileNav` + header responsivo; engrenagem → config da empresa, sino removido).
- **Fixes**: crash da home do gestor/RH (shadowing no `.map` da timeline); PDF comportamental 14→16 competencias; pre-geracao do PDF via `colabId`; chaves `AdminAudit.actions` sem ponto; insights executivos tolerantes a falha.
- **Diagnostico E2E** (read-only, sem custo): crawler de ~65 rotas (`tests/diagnostico.spec.js`) + fluxos criticos + ~60 testes nivel 3 por pagina (`tests/nivel3/`), com auth compartilhada via `storageState`.

## Frente atual do produto

- App principal: Mentor IA multi-tenant em `app.vertho.ai` e subdominios de tenant.
- Publicos: `radar.vertho.ai`, `imprensa.vertho.ai`. (**`radarbett.vertho.ai` DESCONTINUADO em 25/05** — redirect 301: deep-links -> radar, resto -> vertho.ai.)
- Radar: paginas publicas de escola, municipio, rede, estado, comparacao, metodologia e Bett. Inclui matriculas do censo (diag_censo_infra.matriculas, 178k escolas) e secao "Onde a Vertho pode ajudar" (frentes derivadas dos dados, migrada do radarbett).
- Admin Radar: ingestao, qualidade de dados, funnel geral e funnel Bett.
- Mentor IA: dashboards colaborador/gestor/RH, temporadas 14 semanas (default Regular DUO: 2 competencias em blocos paralelos, missoes integradoras; single-comp via programa_modo=regular_single; piloto de 2 semanas p/ degustacao — docs/MODO-PILOTO.md; modo por colaborador com carimbo na trilha, mig 154), votacao por cargo, perfil comportamental, PDI, relatorios e RAG per-tenant.
- **i18n (next-intl, mai/2026)**: pt-BR/pt-PT/es-ES. Locale por empresa (`default_locale`) e colaborador (`locale`). Strings via `t()` em ~80 telas. messages/*.json.
- **Auditoria de admin (mai/2026)**: `admin_audit_log` + pagina `/admin/auditoria`. Disparos (WhatsApp/email/magic-link/Pulso) e mutacoes (empresa/cargo/role/temporada/export/exclusoes) registrados via `lib/audit.ts`.
- **Pulso de Desenvolvimento (novo, mai/2026)**: pesquisa T0/T2 + sinais comportamentais + Dual-IA classifica texto aberto + triangulacao + PDFs Executivo + Complementar NR-1. Multi-tenant. Piloto Macae preparado (59 assignments T0 criados, ciclo fechado).
- **Cliente Macae**: migracao GAS->Supabase concluida (59 colabs, 18 competencias, 51 PDIs migrados via Drive). Samuel Protetti setado como gestor de todos. Telefones limpos sem `+`.

## Banco e migrations

- Migrations atuais: `022` ate `121` (103 arquivos com gaps; ultimas: 118 pulse-lock-rls, 119 i18n-en-us, 120 fase4 idempotencia, 121 FKs votacao).
- Ultimas frentes:
  - `090-092`: Modo Onboarding (sys_config, multi-competencia, tutorados_ids).
  - `093-095`: Mercado Potencial (MVs, INSE proxy, idade-corte flexivel).
  - `096-098`: Pulso (core, MV aggregates, Dual-IA).
  - `099-112`: Radar Empresas (core, CAGED, RAIS, score, CNAE, cidades/TAM) + colab phone login (112).
  - `113`: fecha RLS public (frente de RLS; ficou untracked).
  - `114`: i18n — locale por empresa/colaborador.
  - `115`: censo matriculas (`diag_censo_infra.matriculas`).
  - `116`: log de auditoria de admin (`admin_audit_log`).
- **Aplicar migration**: `node --env-file=.env.local scripts/apply-migration.mjs migrations/NNN-x.sql` (conexao direta via `DATABASE_URL`; a Management API com o PAT da conta retorna 403).

## Pontos de atencao

- RLS existe em varias tabelas, mas boa parte das queries server-side usa `service_role`; a barreira real continua sendo filtro explicito por `empresa_id` e guardas em `lib/auth/action-context.ts`.
- `proxy.js` e o ponto de roteamento por subdominio (Next 16). Rewrites: radar/imprensa -> path interno. `radarbett.vertho.ai` redireciona 301 (`resolveRadarbettRedirect`) — descontinuado.
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
