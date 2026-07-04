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

_(em execução)_

## Fase 3 — Fusões de workspace

_(pendente)_

## Fase 4 — Convergência visual

_(pendente)_

## Fase 5 — Permission-aware UI + curadoria Cenário A

_(pendente)_
