# Histórico das migrações estruturais (arquivo morto)

> **Nada aqui é instrução para hoje.** É o registro de três migrações **concluídas** em 2026, mantido
> para responder "por que isto é assim?" — não para orientar trabalho novo. Consolidado em 27/07/2026
> a partir de 5 documentos que descreviam planos já executados e citavam arquivos `.js` que não
> existem mais.
>
> Absorveu: `JORNADA_DE-PARA_GAS-NEXTJS.md` (796 l), `MAPEAMENTO_COMPARATIVO_GAS_NEXTJS.md` (406 l),
> `paridade-gas-next-auditoria.md` (108 l), `typescript-migration.md` (81 l),
> `tenant-db-migration.md` (130 l). O conteúdo integral segue no histórico do git.

---

## 1. GAS → Next.js (abr/2026) — CONCLUÍDA

O produto nasceu em **Google Apps Script**: uma planilha por empresa, um deploy por empresa,
WebApp do GAS para o colaborador, menu do Sheets como painel do admin. Foi reescrito em Next.js +
Supabase.

**O que a mudança de plataforma resolveu** (a tabela que valia a pena preservar):

| Dimensão | GAS (antes) | Next.js (hoje) |
|---|---|---|
| Multi-tenant | 1 planilha + 1 deploy por empresa | 1 deploy, N empresas, subdomínio wildcard |
| Autenticação | OTP caseiro em `CacheService`, 15 min | Supabase Auth (magic link, senha, OTP WhatsApp) |
| Persistência | dual: Sheets + JSON no Drive | Postgres único |
| E-mail | `GmailApp` — **teto de 100/dia** | Resend |
| PDF | Google Docs template → makeCopy → inject → Drive | `@react-pdf/renderer` em memória |
| Branding | fixo (Vertho) | por tenant (logo, 7 cores, labels) |
| RBAC | inexistente — todos viam tudo | papel × permissão com overrides auditáveis |
| Painel | menu da planilha | pipeline visual por fase |

**Ordem de grandeza na virada:** ~27k linhas de GAS → ~12k de Next.js; 22 abas do Sheets → 20 tabelas;
16 migrations. Hoje o app tem ~898 arquivos TS/TSX e 164 migrations — a comparação só serve para
mostrar de onde se partiu.

**Paridade funcional**: a auditoria de abril catalogou 17 recursos que existiam **só no GAS** e
fechou os cinco gaps P0-P4 (system prompt da conversa, bloco `[EVAL]`, regras de negócio, Cenário B,
check do IA4). O restante da lista — pílulas semanais, registro de evidências, cron de segunda/quinta,
tutor contextual, extended thinking, delta por descritor — **foi implementado depois**, em forma
própria, não portada.

> ⚠️ **Não use a lista de paridade como backlog.** O GAS é **dormant** e o app evoluiu muito além
> dele: o motor de temporadas, o Kit Semanal, o vídeo de microlearning, a arguição e o Pulso não têm
> equivalente lá. Regra vigente no `CLAUDE.md`: **não tentar manter paridade com o GAS.**

## 2. Adoção de `tenantDb` (abr/2026) — CONCLUÍDA

`createSupabaseAdmin()` devolve client `service_role`, que **bypassa RLS**: qualquer query que
esquecesse `.eq('empresa_id', X)` vazava entre tenants. `tenantDb(empresaId)` é um Proxy que **injeta
o filtro** em select/update/delete/insert/upsert de tabelas tenant-owned.

**Resultado:** ~50 funções em 13 arquivos de actions migradas; caminho crítico coberto.

**Exceções legítimas que permanecem `raw` por desenho** — vale conhecer, porque continuam valendo:
- painel curatorial de conteúdos (admin Vertho gerencia `micro_conteudos` globais);
- `cleanupSessoes` do cron (varredura cross-tenant de manutenção);
- agregados cross-tenant do admin (ex.: preferências globais);
- **discovery do tenant** — `findColabByEmail` e afins: não dá para filtrar por aquilo que a query
  existe para descobrir. Esse é o "bootstrap read" que o `tenant-read-guard` reconhece, com a
  exigência de que o `empresa_id` lido seja usado para **escopar ou validar**, nunca só para carimbar.

Doutrina atual (o que ler hoje): `CLAUDE.md` → "Multi-tenant (segurança)" e `ARQUITETURA.md` §11.0
("o que protege o quê"). Os guards de CI que sustentam isso: `tenant-read-guard`,
`tenant-mutation-guard`, `service-role-guard`.

## 3. JavaScript → TypeScript (abr-jun/2026) — CONCLUÍDA

O plano original era **seletivo e incremental**: `allowJs: true`, `strict: false`, converter só os
pontos de alto risco (authz, ai-client, tenant-db, season-engine) e deixar componentes React de fora
por ROI baixo.

**O que aconteceu na prática:** a conversão foi bem além do plano — hoje são ~898 arquivos `.ts/.tsx`
e a regra do projeto é **não escrever JavaScript** (`CLAUDE.md` → "NÃO fazer"). `strict` segue `false`;
a verificação é `npx tsc --noEmit`, que roda no CI junto com o vitest.

Resíduo consciente: scripts operacionais em `scripts/` seguem em `.mjs`/`.js` — são utilitários de
linha de comando, fora do build.
