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

## Cor

- **Navy `#0F2B54` = cor PRIMÁRIA de texto/ação.** É o que o app e os PDFs já lideram.
- **Indigo `#3c385f` = tinta do LOGO/wordmark apenas** — NÃO é cor de texto de UI.
- **Acentos cyan → purple:** cyan `#34C5CC` (primário, cor do logo no escuro) + purple `#9E4EDD` (secundário). Gradiente assinatura cyan→purple (`--vh-gradient`, 120°) só em momentos de destaque (progresso, hero, "subiu de nível") — com parcimônia.
- **Neutros levemente indigo-tinted** (não cinza puro). Navy profundo é tom de apoio.
- **Status sóbrios** (arquétipo Sábio): success `#1F9D6B`, warning `#D9932B`, danger `#D6455C`. Sem neon.
- Rampas completas e aliases semânticos: `tokens/colors.css`.

## Tipografia (sistema de produto)

- **Fraunces** (serif editorial) — display/títulos. Humano, editorial, a voz de um mentor. 500–600, tracking apertado.
- **Inter** — corpo e interface; o default do app **e dos PDFs**. Regular, entrelinha 1.6.
- **Plus Jakarta Sans** (`--font-ui`) — chrome de UI: botões, labels, nav, chips.
- **Codec Cold** (`--font-wordmark`, `assets/fonts/*.otf`, Zetafonts) — **só o logo/wordmark**, não é fonte de sistema. Codec não tem SemiBold (600 → Bold).
- Escala e pesos: `tokens/typography.css`. No app, as webfonts já entram por `next/font` (`app/layout.tsx`).

## Forma, sombra, movimento

- Cantos arredondados: 12px (controles), 16px (cards), 24px (diálogos), pill (botões/tabs/badges).
- Sombras **suaves, tingidas de indigo** — nunca preto duro. Foco = anel cyan 3px.
- Espaço base 4px; motion rápido e gentil (`--ease-out`, 120/200/340ms). Detalhes: `tokens/spacing.css`.

## Voz e conteúdo

- **Arquétipo Sábio ("Sábio"):** sereno, analítico, preciso — um guia confiável, nunca frio. O nome vem de *vertere* ("converter") → transformar informação em sabedoria aplicável.
- **Pessoa:** "você" / "sua equipe" / "seus alunos"; a empresa é "a Vertho". Segunda pessoa calorosa, nunca "engenheiro-pra-engenheiro".
- **Caixa:** sentence case; wordmark sempre minúsculo `vertho.ai`; UPPERCASE só em overline/label com tracking largo.
- **Use:** competências, desenvolvimento, DISC, perfil comportamental, trilhas, autoconhecimento, mentoria, Mentor IA, evolução, jornada, escolas, empresas, RH, representantes.
- **Evite (produto errado):** API, tokens, latência, model ID, completions, endpoint, SDK, uptime, "developer". A Vertho NÃO é infraestrutura de software.
- Sem emoji no chrome de produto/marketing; use ícones (Lucide, traço 2px).

## Logos e ícones

- `assets/logo-h-{claro,escuro}.png` (horizontal), `assets/logo-ac-{claro,escuro}.png` (empilhado/stacked), `assets/icone-{claro,escuro}.png` (símbolo V+i). "claro" = para fundo claro, "escuro" = para fundo escuro. Nos PDFs, o logo entra via `lib/pdf-assets.ts` (`public/logo-vertho*.png`).

## Onde está o quê

- `tokens/` — colors, typography, spacing, fonts (webfonts), codec (wordmark). `styles.css` importa todos.
- `guidelines/` — cards HTML de referência visual (cor, tipo, escala, logo, raio/sombra).
- `assets/` — logos (PNG) + fontes Codec Cold (.otf).
- `readme.md` — fundamentos completos + nota de posicionamento (a marca é RH/educação, não AI-infra).

## Fontes da verdade em código (não duplicar valor aqui)

- PDFs: `components/pdf/tokens.ts` → `components/pdf/styles.ts`.
- Web: `app/globals.css` (ramp `--brand-*`, `--navy`, `--cyan`) + `components/page-shell.tsx`.
- Ao propor mudança de cor/tipo, mexa no token em código — não espalhe hex.
