# Reorganização do Admin — registro de alterações e decisões

> Execução em 5 fases (04/07/2026), a partir da auditoria de navegação/layout/fluxos.
> Este documento é o registro vivo: cada fase lista o que mudou, onde e **por quê**.

## Smoke test em produção (04/07)

Rodado com sessão admin master real (`generate_link`+`verify`, cookie SSR no Playwright) sobre o deploy `eb99d78`. Verificado: menu agrupado nas 10 seções; workspace Adequação com as 3 tabs; workspaces Auditorias e Potencial de Mercado; redirects legados (`votacao`→cargos, `escolas`→ppp?tab=escolas, `calibracao`/`ranking`→fit) chegando na tab certa; **ConfirmDialog crítico de "Excluir empresa"** — trava validada (nome errado mantém Confirmar desabilitado, nome certo habilita), cancelado sem excluir; Fase 4 visual em `conteudos` (fundo do shell, botões cyan/outline).

**Bug encontrado e corrigido no smoke:** chegar a um workspace **via `redirect()`** (link/bookmark antigo) disparava React #310 (hydration mismatch de hooks) porque as páginas de workspace leem `useSearchParams()` sem `<Suspense>`. Só afetava a chegada por rota redirecionada (o menu navega client-side, sem erro), e a tela auto-recuperava — mas é regressão que os próprios redirects expõem. Corrigido envolvendo `PPP/Fit/Cargos/Auditorias/MercadoPotencial` num boundary `<Suspense>` (`*PageInner`), padrão canônico do Next para `useSearchParams`. Commit `<pending>`.

## Débitos assumidos / follow-ups

- i18n da tab Escolas (conteúdo interno segue hardcoded pt-BR, herdado da tela original órfã).
- Modal compartilhado (23 hand-rolled), `EmptyDataState`/`FilterBar` nas demais páginas, `#0F2A4A`→`Surface` em `gerenciar`/`configuracoes`/`relatorios`.
- Troca de tab nos workspaces não reescreve a URL (padrão herdado do fase1); deep-link via `?tab=` funciona.
- Remoção definitiva das rotas-redirect (top10, relatorios global, funnel-bett, escolas, votacao, ranking, calibracao, avaliacao-acumulada, auditoria-sem14, potencial-cidades) em release futura, após confirmar que ninguém mais as acessa (logs Vercel).
- `prompt()` nativo remanescente na escolha de perfil do simulador de temporadas (fora do escopo alert/confirm).

## Diagnóstico que motivou o trabalho (resumo)

- Menu lateral plano com 26 itens sem agrupamento (`app/admin/_shell/nav-items.ts`); 31 de 64 páginas só alcançáveis via hub do pipeline; 1 tela órfã (`escolas`), 3 legadas navegáveis (`top10`, `relatorios` global, `radar/funnel-bett`).
- 4 mecanismos de resolução de contexto de empresa que não interoperam (path param, `useSearchParams`, `URLSearchParams` cru, filtro do header).
- Design system existente (`components/ui`, `page-shell`, `empty-state`) usado só no dashboard; 23 modais hand-rolled, 87 selects crus, 4 mecanismos de feedback (sonner, `alert()`, msg inline, log).
- Toda ação destrutiva protegida só por `window.confirm()` — inclusive "Limpar TUDO" e "Excluir empresa".
- Papel sócio 100% server-side: vê todos os botões e descobre o bloqueio no clique.

---

## Fase 1 — Menu lateral agrupado por domínio

### Alterações

| Arquivo | Mudança |
|---|---|
| `app/admin/_shell/nav-items.ts` | `NavItem` ganhou `group` (seção) e `permission` (opcional, aplicado na Fase 5). Novo `GROUP_ORDER` com 10 seções. 11 itens novos; 3 renomeados. |
| `app/admin/_shell/AdminSidebar.tsx` | Renderiza seções com cabeçalho (colapsada: divisor no lugar do texto). |
| `app/admin/_shell/AdminMobileNav.tsx` | Mesmo agrupamento no drawer mobile. |
| `messages/{pt-BR,pt-PT,es-ES,en-US}.json` | `AdminDashboard.nav.groups` (10 chaves) + 11 labels + 11 subs novos + 3 renomeações. Injetado via script para preservar formatação. |
| `app/admin/top10/page.tsx` | Virou redirect → `/admin/cargos` (preserva `?empresa=`). UI antiga removida (histórico no git). `actions.ts` não existia; as actions compartilhadas de `actions/fase1` seguem usadas pelo hub e `fase1`. |
| `app/admin/relatorios/page.tsx` | Virou redirect → `/admin/empresas/[id]/relatorios` (com `?empresa=`) ou dashboard. `relatorios/actions.ts` mantido (referenciado por teste de segurança). |
| `app/admin/radar/funnel-bett/page.tsx` | Virou redirect → `/admin/radar/funnel` (BETT descontinuado). `actions.ts` mantido. |
| `app/admin/empresas/[empresaId]/page.tsx` | Link "Preferências" da F0 deixou de passar pelo redirect morto `fase0?tab=preferencias` e aponta direto para `/admin/preferencias-aprendizagem?empresa=`. |

### Estrutura de grupos (ordem fixa em `GROUP_ORDER`)

| Grupo | Modo empresa | Modo "Todas" |
|---|---|---|
| **Visão geral** | Dashboard | Dashboard, Empresas |
| **Operação** | Pipeline, Temporadas ➊, Envios ➊, Pulso ➊ | — |
| **Configuração** | Banco de Competências, Competências do Cargo ➊, Votação, Escolas & PPP ➊, Configurações ➊ | Banco de Competências |
| **Conteúdo** | Conteúdos, Kits ➊, Vídeos, Knowledge Base, Preferências | + Módulos-Base |
| **Resultados** | Perfis Comportamentais, Relatórios ➊, Adequação (Fit) ➊, Evolução ➊ | — |
| **Auditoria Vertho** | Evidências, Av. Acumulada, Sem 14 | — |
| **Dados educacionais** | — | Radar (Ingestão), Qualidade Dados |
| **Comercial** | — | Radar Empresas, Mercado Potencial, Potencial por Cidade |
| **Custos** | Custos de IA, Orçamento | idem |
| **Sistema** | Simulador de Fluxo | Admins, Permissões, Auditoria, Lixeira, Ambiente Demo ➊ |

➊ = item novo no menu (a tela já existia; antes só era alcançável pelo hub ou por URL direta).

### Decisões e racional

1. **Grupos com cabeçalho, itens continuam nível único** — dropdowns/acordeões em sidebar escondem conteúdo e pioram descoberta; cabeçalho + ordem resolve sem custo de clique.
2. **Item "Empresas" só no modo "Todas"** — no modo empresa ele duplicava o item "Pipeline" (ambos levavam ao hub). Removida a duplicata; "Pessoas & Cargos" continua acessível pelo hub F0.
3. **"Envios" em vez de "WhatsApp"** — a tela dispara magic links, e-mail, WhatsApp e relatórios; o nome antigo escondia 3/4 das funções.
4. **"Custos de IA" em vez de "Custo IA"/"Simulador de custo"** e **"Simulador de Fluxo"** — desfaz a colisão de nomes entre os dois "simuladores".
5. **"Banco de Competências" vs "Competências do Cargo"** — separa o banco base (global) da curadoria por cargo (Top 10/Top 5/gabarito), que na Fase 3 vira workspace único.
6. **"Escolas & PPP" aponta para `/admin/ppp` por ora** — a fusão com a tela órfã `escolas` acontece na Fase 3; o item de menu já nasce com o nome final.
7. **Demo entra no menu (Sistema)** — era órfã "por design", mas ferramenta usada por vendedores merece porta oficial; ganha `permission: companies.manage` (Fase 5) para sumir para o sócio.
8. **Legado = redirect, não deleção** — `top10`, `relatorios` global e `funnel-bett` redirecionam (bookmarks, docs e testes antigos continuam funcionando). Remoção definitiva pode acontecer em release futura.
9. **Campo `permission` já declarado nos itens sensíveis** (radar admin, comercial, custos, lixeira, demo) — a filtragem em si liga na Fase 5, junto com o contexto de permissões no shell.
10. **en-US também atualizado** — o repo tem 4 locales (a memória do projeto citava 3); manter os 4 sincronizados evita fallback quebrado.

---

## Fase 2 — Padrões transversais

### Componentes novos

| Arquivo | O que é |
|---|---|
| `components/admin/confirm-dialog.tsx` | `ConfirmDialogProvider` + hook `useConfirm()`. Confirmação em 3 níveis: `normal` (decisão comum), `danger` (destrutiva recuperável / operação cara de IA, accent #F97354), `critical` (irrecuperável/em massa, accent vermelho, pode exigir `typedConfirmation` — digitar o nome da empresa etc.). Suporta `scopeNote` para destacar escopo/custo. A11y: `role="alertdialog"`, ESC cancela, foco inicial no cancelar (ou input). Provider montado no `AdminShell`. |
| `components/admin/page-header.tsx` | `AdminPageHeader` — consolida as 4 variantes de header em uma: h1 `text-xl` + ícone lucide, subtítulo, `BackButton` opcional, slot de ações à direita. Adoção progressiva (Fase 4). |
| `app/admin/_shell/useEmpresaContexto.ts` | Hook único do "qual empresa?": resolve na ordem **path param → `?empresa=` → filtro do header**. Elimina os 4 mecanismos concorrentes; qualquer porta de entrada (sidebar, hub, URL direta) passa a funcionar. |

### Aplicações

- **Hub da empresa** (`empresas/[empresaId]/page.tsx`): "Excluir empresa" e itens marcados como perigosos na danger zone ("Colaboradores", "Limpar TUDO") agora são `critical` com **digitação do nome da empresa**; demais limpezas são `danger` com escopo destacado; senha de teste é `normal`.
- **Lixeira**: purge ("esvaziar antigos") é `critical` com digitação de palavra (`AdminTrash.confirm.emptyWord`, por locale); restore é `danger`; `alert()` de resultado → sonner. Também perdeu o fundo near-black próprio e adotou `AdminPageHeader` + `useEmpresaContexto` (antecipando Fase 4).
- **Demo**: reset vira `danger` com `scopeNote` ("só afeta o tenant acme-demo").
- **Varredura completa** (por agente, revisada): todo `alert()` de app/admin → sonner (`success`/`error`/`warning`); todo `confirm()` restante → `useConfirm` com severidade conforme a regra acima; páginas com `URLSearchParams` cru ou `useSearchParams('empresa')` → `useEmpresaContexto`.
- **i18n**: `Common.actions.cancel/confirm` + `Common.confirmDialog.typeToConfirm` nos 4 locales.

### Decisões e racional

1. **Hook `useConfirm` via provider** (e não modal controlado por página) — adoção em 1 linha por call-site, sem estado local; o dialog é um só, consistente, com a11y correta num único lugar.
2. **`typedConfirmation` só quando existe um nome óbvio a digitar** (nome da empresa, palavra fixa localizada) — digitação genérica ("CONFIRMAR" em tudo) treina o usuário a digitar no automático e anula a proteção.
3. **Operações caras de IA usam `danger` + `scopeNote`**, não `critical` — o custo é dinheiro/tempo, não perda de dados; a fricção certa é informar o escopo, não travar.
4. **Ordem path → query → filtro no `useEmpresaContexto`** — contexto explícito (rota/link compartilhado) sempre vence o implícito (filtro persistido em localStorage), evitando operar na empresa errada ao abrir um link.

## Fase 3 — Fusões de workspace

Cinco fusões, todas no mesmo padrão: workspace com tabs (`?tab=`, padrão visual do `fase1`), conteúdo movido para `_components/*-tab.tsx` **sem mudança de comportamento**, `actions.ts` ficam onde estavam, e as rotas antigas viram **redirect server-side** (bookmarks e links antigos seguem funcionando).

| Workspace | Rota | Tabs | Rotas aposentadas (→ redirect) |
|---|---|---|---|
| **Escolas & PPP** | `/admin/ppp` | PPPs · Escolas & vínculos | `empresas/[id]/escolas` (era órfã!) |
| **Competências do Cargo** | `/admin/cargos` | Top 5 do Workshop · Votação | `empresas/[id]/votacao` |
| **Adequação** | `/admin/fit` | Fit v2 · Ranking (preview gestor) · Calibração `dev/interno` | `empresas/[id]/ranking`, `empresas/[id]/calibracao` |
| **Auditorias (13/14)** | `/admin/vertho/auditorias` (novo) | Sem 13 — Av. Acumulada · Sem 14 — Auditoria Final | `vertho/avaliacao-acumulada`, `vertho/auditoria-sem14` |
| **Potencial de Mercado** | `/admin/vertho/mercado-potencial` | Mercado · Unificado (empresas+escolas) | `vertho/potencial-cidades` |

Ajustes de amarração (nav/hub/i18n):
- `nav-items.ts`: itens `votacao`, `acumulada`+`sem14` e `potencial-cidades` removidos/fundidos (menu passa a refletir os workspaces); subs atualizados ("Top 5 · Votação", "Fit · Ranking · Calibração", "Semana 13 · Semana 14", "Municípios · Redes · Unificado").
- Hub (`PHASE_CONFIG`): F1 Votação → `cargos?tab=votacao`; F2 Calibração/Ranking → `fit?tab=...`; F4 auditorias → `auditorias?tab=sem13|sem14`.
- Dashboard QuickActions e link do `fase1` atualizados para os novos destinos.
- Novas chaves i18n de tab nos 4 locales: `AdminRoles.tabs.*`, `AdminAuditorias.tabs.*`, `AdminFit.workspaceTitle`/`tabs.*`, `AdminPPP.tabs.*`.
- `AdminShell.setEmpresaFiltro` agora também **sincroniza o `?empresa=` das páginas globais** ao trocar empresa no header (e remove o parâmetro ao voltar para "Todas") — sem isso, o query param "prendia" a tela na empresa antiga por ter precedência no `useEmpresaContexto`.

### Decisões e racional

1. **Workspaces vivem nas rotas GLOBAIS (`?empresa=`), não na subárvore `[empresaId]`** — com o `useEmpresaContexto` + sincronização do filtro, a rota global funciona por qualquer porta; a subárvore fica reservada ao que é intrinsecamente do pipeline (fases, configurações, pulso).
2. **Top 10 NÃO virou tab do workspace de cargos** — a edição do Top 10 permanece exclusiva do `fase1?tab=top10` (contexto do pipeline, onde a IA1 roda). Motivo: era a função mais duplicada do app (3 telas); a fusão consolidou em UMA (fase1), e o workspace de cargos cobre a decisão humana (Top 5/votação).
3. **Calibração ficou como tab com badge `dev/interno`** em vez de escondida — quem opera precisa achá-la; o badge + permissão futura resolve o risco de uso indevido.
4. **Potencial de Mercado**: fusão de `mercado-potencial`+`potencial-cidades` (mesma pergunta comercial, dados complementares); `radarempresas` ficou fora por ter subtree própria (redes/listas/CNPJ) — seria um mega-merge com risco alto e ganho baixo.
5. **Redirects preservam `?empresa=` e apontam para a tab certa** — nenhum link antigo quebra (docs, testes, bookmarks, WhatsApp de operadores).

## Fase 4 — Convergência visual

### Alterações

- **Fundos near-black próprios eliminados** (as 5 páginas que pintavam `from-[#0a0e1a]` por cima do navy do shell): `conteudos`, `lixeira` (na Fase 2), `temporadas`, `evolucao`, `assessment-descritores`. O conteúdo agora assenta no fundo do shell.
- **`AdminPageHeader` adotado** nessas páginas (título text-xl + ícone lucide + subtítulo + ações à direita) — fim dos headers text-2xl/emoji.
- **`conteudos`**: os 6 botões "arco-íris" (purple/indigo/fuchsia) normalizados — ações reais em `bg-cyan-600` sólido; **navegação disfarçada de ação** ("Gerar Kit", "Extrair de vídeo") virou outline com `ArrowRight`, sinalizando que leva a outra tela.
- **`empresas/[id]/relatorios`**: botão indigo→purple fora da paleta trocado por cyan.
- Fundos opacos funcionais (células sticky de tabela) foram preservados de propósito — não são fundo de página.

### Decisões e racional

1. **Convergência começa pelo que grita** (dupla camada de fundo + botões fora da paleta), não por reescrever tudo em `Surface` — as ~300 ocorrências de `#0F2A4A` sólido são harmônicas com o shell e migram página a página em manutenções futuras (baixo custo, zero pressa).
2. **Vocabulário de botão**: sólido = executa aqui; outline+seta = navega. Essa distinção era a maior fonte de "botão fora de lugar" do admin.
3. Fica como **débito assumido** (não bloqueia): Modal compartilhado (23 hand-rolled), `EmptyDataState`/`FilterBar` nas demais páginas, migração `#0F2A4A`→`Surface` em `gerenciar`/`configuracoes`.

## Fase 5 — Permission-aware UI + curadoria Cenário A

> Executada junto com a Fase 2 (mesmos arquivos de shell); listada aqui pela ordem lógica do plano.

### Alterações

| Arquivo | Mudança |
|---|---|
| `app/admin/_shell/actions.ts` | Nova action `loadAdminShellPermissoes()` → papel (`platform_admin`/`socio`) + permissões efetivas (`getEffectivePermissionKeys`, respeita overrides). |
| `app/admin/_shell/AdminShellContext.tsx` + `AdminShell.tsx` | Contexto expõe `adminRole` e `podeVer(permission)`. Carregado no mount do shell. |
| `AdminSidebar.tsx` / `AdminMobileNav.tsx` | Itens com `permission` (radar admin, comercial, custos, lixeira, demo) somem para quem não tem a permissão. |
| `empresas/[empresaId]/page.tsx` (hub) | Botões de **IA** desabilitados com tooltip "Requer papel Admin Master" quando falta `ai.audit.regenerate`; **danger zone inteira oculta** sem `companies.manage`. Novo link F1 "Curadoria de Cenários" → `fase1?tab=cenarios`. |
| i18n (4 locales) | `AdminCompanyPipeline.actions.requiresMaster` + `actions.cenarios-cur`. |

### Decisões e racional

1. **`podeVer` é default-open durante carregamento/erro** — se as permissões não carregarem, a UI se comporta como antes (mostra tudo). O custo é um flash cosmético para o sócio num hard reload; a alternativa (default-closed) esconderia menu do Master em falha transitória. O enforcement real segue 100% server-side (`requireAdminAction`), então não há risco de segurança.
2. **Botões de IA: desabilitar com tooltip, não esconder** — o sócio precisa VER que o pipeline tem essas ações (transparência do processo); só não pode dispará-las. Danger zone: esconder, porque ali nada é aproveitável em leitura.
3. **Curadoria de Cenário A NÃO precisou de tela nova** — a auditoria apontava assimetria A/B, mas `fase1?tab=cenarios` já tem regenerar/check/excluir por item e em lote. O problema era descoberta: o hub gerava (IA3) sem linkar a curadoria. Resolvido com o link "Curadoria de Cenários" na F1 (espelha o padrão da F4, que sempre linkou a curadoria do Cenário B).
