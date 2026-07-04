# Reorganização do Admin — registro de alterações e decisões

> Execução em 5 fases (04/07/2026), a partir da auditoria de navegação/layout/fluxos.
> Este documento é o registro vivo: cada fase lista o que mudou, onde e **por quê**.

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

_(pendente)_

## Fase 4 — Convergência visual

_(pendente)_

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
