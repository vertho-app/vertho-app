---
name: vertho-design
description: Sistema de design da marca Vertho (cor, tipografia, logo, voz e regras visuais). Use ao criar/ajustar qualquer artefato de marca — PDFs, telas de admin/dashboard, e-mails, one-pagers, slides, protótipos ou o site institucional — ou quando o usuário falar em design, branding, identidade, cores, tipografia, logo ou "look and feel". Encodes os tokens canônicos, a voz (arquétipo Sábio, PT-BR) e a regra de ouro: tokens/regras = verdade; os componentes deste bundle = referência ilustrativa (produção usa os componentes REAIS do app).
user-invocable: true
---

# Vertho — Design System

A Vertho é uma **plataforma de desenvolvimento de competências (RH + educação + IA)**: mapeamento comportamental (DISC), trilhas (Temporadas) e um Mentor IA no WhatsApp, para escolas e empresas, com um canal de representantes. **PT-BR primeiro.**

## Regra de ouro (leia antes de usar)

- **Tokens e regras de marca = fonte da verdade.** Cor, tipo, espaçamento, raio, voz — seguem este bundle.
- **Os componentes/marketing que acompanham o DS original são ILUSTRATIVOS**, não os componentes reais do app (o bundle foi gerado sem a base de código). Por isso este pacote **não** os inclui. Para produção:
  - **PDFs** → importe de **`components/pdf/tokens.ts`** (fonte única em código, já ligada ao `components/pdf/styles.ts`; flags `NEUTRAL_RAMP` e `STATUS_PALETTE` controlam a rampa neutra e os status). Não hardcode hex — use o token.
  - **Web/app** → use o **`components/page-shell.tsx`** real (PageContainer/PageHero/GlassCard/SectionHeader) e os utilitários de marca do `app/globals.css` (`bg-brand-*`, `--navy`, `--cyan`). A cor de marca já é navy `#0F2B54` + cyan `#34C5CC`.
- **Artefatos throwaway** (mocks, slides, protótipos HTML): pode copiar `assets/` e `tokens/` e montar HTML estático linkando `styles.css`.

## ⚠️ O produto roda em superfície ESCURA — o DS descreve a clara

O bundle assume página clara (`--surface-page: #f7f7fb`, cards brancos, sombra tingida de indigo).
Isso vale para **PDFs, proposta, site, slides e one-pagers**. A **UI web (admin + dashboard) é
escura** e sempre foi. Aplicar os aliases claros numa tela é o erro mais fácil de cometer com este DS.

| | DS / marca (claro) | App web (escuro) — `app/globals.css` |
|---|---|---|
| Fundo | `--surface-page #f7f7fb`, card branco | gradiente navy `#06172C → #091D35 → #0F2B54`; card = `GlassCard` (`rounded-2xl`, `border-white/[0.06]`, backdrop-blur) |
| Texto | `--text-strong` navy sobre claro | `--ink #F3F7FB` · `--ink-dim` .62 · `--ink-faint` .38 |
| Bordas | `--border-subtle/strong` (cinza) | `--line` / `--line-strong` (branco .08/.14) · `--line-phase` |
| Sombra | indigo suave, "nunca preto" | `--shadow-float 0 24px 48px rgba(0,0,0,.42)` · `--shadow-card` — **preto é o certo aqui**: indigo some em fundo navy |
| Raio | 4/8/12/16/24/pill | **3 valores e só estes**: `--radius-sm 10` · `md 16` · `lg 24`. Não há 12px nem pill como token |
| Status | `#1F9D6B` / `#D9932B` / `#D6455C` | `--success #2ECC71` · `--warning #F4B740` · `--danger #E74C3C` · `--coral #F97354` |

**Três paletas de status convivem, de propósito:** a do app (acima), a dos PDFs
(`STATUS_PALETTE = 'vivid'` → `#16A34A/#EA580C/#B91C1C`, o default de hoje) e a sóbria do DS
(`'ds'`). Idem para a neutra: `NEUTRAL_RAMP = 'slate'` é o default; a rampa indigo do DS é **opt-in**
(flags em `components/pdf/tokens.ts`). Não "corrija" um hex para o valor do DS achando que é bug.

**Sub-sistemas com paleta própria por decisão** (não são desvio): documento da **proposta comercial**
(claro/editorial, Space Grotesk + IBM Plex, índigo `#4F46E5`) e os **vídeos Remotion**
(`video-spike/remotion/theme.tsx`). Ambos em `docs/DESIGN-SYSTEM.md`.

## Cor não é fixa: white-label por tenant

`app/globals.css` declara a rampa **`--brand-100..700`** em `@theme inline` (fallbacks = cyan do
Tailwind, então a Vertho fica pixel-idêntica). `app/dashboard/dashboard-shell.tsx` **sobrescreve
`--brand-*` em runtime** a partir do `accent` do tenant (`brandRampVars`, `color-mix`), e a aba
Branding consegue extrair a paleta do site do cliente. Em tela de produto use `bg-brand-*` /
`text-brand-*` / `from-brand-*` — **hardcodar `#34C5CC` quebra o white-label**. Cyan é o *default* da
Vertho, não uma constante.

Há ainda os **tokens de fase**: `[data-phase="1".."5"]` → `--phase-accent` / `--phase-deep` /
`--phase-glow` (jornada; `MetricCard` usa `--phase-accent` como acento padrão).

## Cor

- **Navy `#0F2B54` = cor PRIMÁRIA de texto/ação.** É o que o app e os PDFs já lideram.
- **Indigo `#3c385f` = tinta do LOGO/wordmark apenas** — NÃO é cor de texto de UI.
- **Acentos cyan → purple:** cyan `#34C5CC` (primário, cor do logo no escuro) + purple `#9E4EDD` (secundário). Gradiente assinatura cyan→purple (`--vh-gradient`, 120°) só em momentos de destaque (progresso, hero, "subiu de nível") — com parcimônia.
- **Neutros levemente indigo-tinted** (não cinza puro). Navy profundo é tom de apoio.
- **Status sóbrios** (arquétipo Sábio): success `#1F9D6B`, warning `#D9932B`, danger `#D6455C`. Sem neon.
- Rampas completas e aliases semânticos: `tokens/colors.css`.

## Tipografia (o que o app REALMENTE carrega)

`app/layout.tsx` carrega **5 famílias** por `next/font` — o bundle só descreve três delas:

| Família | Var | Onde é usada |
|---|---|---|
| **Inter** | `--font-inter` | corpo e interface — default do `<body>` e dos PDFs (lá registrada como `'NotoSans'`) |
| **Instrument Serif** | `--font-serif` | **a serif de display do PRODUTO** — `PageHero`/`SectionHeader` do `components/page-shell.tsx` e ~36 telas |
| **Fraunces** | `--font-fraunces` | a serif de display da **MARCA** — capas de PDF, certificado, `/radarbett`, `/imprensa` |
| **Plus Jakarta Sans** | `--font-jakarta` | chrome/rótulos: eyebrows e labels dos PDFs e do `/radarbett` |
| **Manrope** | `--font-manrope` | eyebrows em caixa alta do radar (`.eyebrow-manrope`, `-sm`) |

**Fraunces é a serif da marca; Instrument Serif é a serif da tela.** Não trocar uma pela outra sem
decisão explícita — hoje nenhuma tela de dashboard/admin usa Fraunces. Fora dessas 5, o
`lib/certificado-pdf.tsx` registra **Dancing Script** localmente, só para a linha da assinatura.

- Pesos, escala e tracking: `tokens/typography.css` (a escala do bundle é referência de marca; nas telas o Tailwind manda).
- ⚠️ **`--font-mono` (JetBrains Mono) é aspiracional** — não é carregada em lugar nenhum do produto.
- ⚠️ **Codec Cold não existe em código**: 0 ocorrências em `app/`, `components/`, `lib/`, `public/`. O wordmark entra como **PNG** (`lib/pdf-assets.ts` → `public/logo-vertho*.png`); os `.otf` daqui servem a artefatos de marca fora do app. Codec não tem SemiBold (600 → Bold).
- ⚠️ **Codec Cold é fonte de DISPLAY, não de texto corrido** (medido 05/08/2026, deck 7 × 2): os glifos de vírgula, ponto e interrogação têm sidebearing largo, então `anterior, as duas` renderiza como `anterior , as duas` e `turma?` vira `turma ?`. Em parágrafo isso pipoca em cada linha. Receita: Codec só em títulos, números, eyebrows e rótulos — **escritos sem pontuação interna** (troque a vírgula por travessão) —, corpo numa sans neutra; para a pontuação inevitável de um título, `<span>` com `margin-left: -0.05em` (−0.16em já cola o glifo na letra).

## Forma, sombra, movimento

- Cantos arredondados: 12px (controles), 16px (cards), 24px (diálogos), pill (botões/tabs/badges). **Na UI web isto NÃO vale** — o app tem 3 raios (10/16/24) e não usa pill; ver a tabela do topo.
- Sombras **suaves, tingidas de indigo** — nunca preto duro. Foco = anel cyan 3px. (De novo: vale na superfície clara; no app escuro a sombra é preta.)
- Espaço base 4px; motion rápido e gentil (`--ease-out`, 120/200/340ms). Detalhes: `tokens/spacing.css`.

## Voz e conteúdo

- **Arquétipo Sábio ("Sábio"):** sereno, analítico, preciso — um guia confiável, nunca frio. O nome vem de *vertere* ("converter") → transformar informação em sabedoria aplicável.
- **Pessoa:** "você" / "sua equipe" / "seus alunos"; a empresa é "a Vertho". Segunda pessoa calorosa, nunca "engenheiro-pra-engenheiro".
- **Caixa:** sentence case; wordmark sempre minúsculo `vertho.ai`; UPPERCASE só em overline/label com tracking largo.
- **Use:** competências, desenvolvimento, DISC, perfil comportamental, trilhas, autoconhecimento, mentoria, Mentor IA, evolução, jornada, escolas, empresas, RH, representantes.
- **Evite (produto errado):** API, tokens, latência, model ID, completions, endpoint, SDK, uptime, "developer". A Vertho NÃO é infraestrutura de software.
- Sem emoji no chrome de produto/marketing; use ícones (Lucide, traço 2px).

## Logos e ícones

- `assets/logo-h-{claro,escuro}.png` (horizontal), `assets/logo-ac-{claro,escuro}.png` (empilhado/stacked), `assets/icone-{claro,escuro}.png` (símbolo V+i). Nos PDFs, o logo entra via `lib/pdf-assets.ts` (`public/logo-vertho*.png`).
- ⚠️ **O sufixo nomeia a TINTA do arquivo, não o fundo de destino** (medido 05/08/2026, abrindo os PNGs): `logo-h-claro.png` é o wordmark **branco + cyan** → vai em fundo **escuro**; `logo-h-escuro.png` é o wordmark **índigo `#3c385f`** → vai em fundo **claro**. Ler "claro = para fundo claro" põe logo branco sobre papel branco e ele **some sem erro nenhum** — nada no build acusa. Ao alternar por tema, cheque qual arquivo está em qual ramo.

## Componentes reais (o bundle não tem nenhum deles)

`components/ui/` exporta **só quatro coisas**: `Button`, `Surface`/`SurfaceHeader`, `MetricCard` e os
estados assíncronos (`LoadingState`, `EmptyDataState`, `ErrorState`, `Spinner`, `Skeleton`).
**Não existem** `IconButton`, `Input`, `Select`, `Checkbox`, `Radio`, `Switch`, `Card`, `Badge`,
`Tag`, `Tabs`, `Dialog` nem `Tooltip` como primitivos — as telas montam isso com Tailwind sobre o
`components/page-shell.tsx` (`PageContainer` · `PageHero` · `GlassCard` · `SectionHeader`).
**Toast é o `sonner`** (`<Toaster theme="dark" richColors>` no `app/layout.tsx`).

`Button` real: `variant primary|secondary|ghost|danger` · `size sm|md|icon` · `leftIcon`/`rightIcon` ·
`loading`/`loadingLabel`. **Não** tem `accent`, `gradient`, `fullWidth`, `iconLeft` nem pill (usa
`rounded-md`). `Surface`: `tone default|muted|accent` · `padding none|sm|md|lg`.
`MetricCard`: `label` · `value` · `helper` · `icon` · `accent` (default `--phase-accent`).

Se um documento de DS descrever "API de componentes" com `iconLeft`, `Card variant="elevated"` ou
`Dialog` — é o bundle ILUSTRATIVO, não o app. A referência real é `docs/ui-components.md`.

## Onde está o quê

- `tokens/` — colors, typography, spacing, fonts (webfonts), codec (wordmark). `styles.css` importa todos.
- `guidelines/` — cards HTML de referência visual (cor, tipo, escala, logo, raio/sombra).
- `assets/` — logos (PNG) + fontes Codec Cold (.otf).
- `readme.md` — fundamentos completos + nota de posicionamento (a marca é RH/educação, não AI-infra).

## Fontes da verdade em código (não duplicar valor aqui)

- PDFs: `components/pdf/tokens.ts` → `components/pdf/styles.ts`.
- Web: `app/globals.css` (ramp `--brand-*`, `--navy`, `--cyan`) + `components/page-shell.tsx` + `components/ui/`.
- Tema escuro do app, proposta comercial e vídeos: `docs/DESIGN-SYSTEM.md`. Componentes: `docs/ui-components.md`.
- Ao propor mudança de cor/tipo, mexa no token em código — não espalhe hex.

> Se aparecer um `VERTHO-DESIGN-SYSTEM.md` avulso (o bundle de handoff v1, fora do repo): ele é a
> **v1 crua** — bate token a token com `tokens/*.css` daqui, mas descreve superfície clara e uma API
> de componentes que não existe. Esta skill é a versão reconciliada; não recolar aquele arquivo no repo.
