# Vertho Design System

Brand + UI design system for **Vertho (vertho.ai)** — a **competency-development platform**
that brings together **HR, education and AI**. Vertho helps schools and companies develop people
with method: behavioral mapping (**DISC**), **learning trails/tracks (trilhas)**, and an
**AI Mentor ("Mentor IA") on WhatsApp**. It serves both **educational institutions and
businesses**, and goes to market partly through a network of **representatives (representantes)**.
Primary language is **Brazilian Portuguese**.

> ⚠️ **Positioning note.** An earlier draft of this system mis-inferred Vertho as "developer AI
> infrastructure / model API" from the logo alone. That was wrong. Vertho is about **people and
> competency development**, not developer tooling. All copy, voice and product framing here reflect
> the corrected positioning. If any AI-API-flavored language remains anywhere, treat it as a bug.

## Sources provided
- **Logo suite** — `logo Vertho tamanho A4 PDF Vetor/` (mounted local folder): icon mark + horizontal/
  stacked `vertho.ai` lockups, light ("claro") / dark ("escuro"), PNG + PDF. Copied into `assets/`.
- **Color palette** — `uploads/PHOTO-2025-10-24-16-09-35.jpg`: cyan + purple accent families and a
  deep navy `#0f2b54` (the app/PDF primary). Indigo `#3c385f` sampled from the logo (wordmark ink).
- **Brand/naming deck** — `uploads/Marca.pptx`: the naming & archetype rationale. Vertho is built on
  the **Sage ("Sábio") archetype** — serene, analytical, precise, a trustworthy guide. The name comes
  from *vertere* ("to turn / convert") → **turning information into actionable wisdom**.
- **Fonts** — `uploads/Codec-Cold-*.otf` / `Codec-Warm-*.otf` (Zetafonts). Codec Cold is the
  **wordmark** typeface. The **product** type system is Fraunces + Inter + Plus Jakarta Sans (below).
- No product codebase, Figma, or real screenshots were provided — so the **UI kit is a
  representative interpretation** of the corrected positioning, not a faithful recreation.

---

## Content fundamentals
- **Language:** **Brazilian Portuguese** first. Write copy in PT-BR (the app and PDFs are in PT-BR).
- **Voice:** a **mentor / guide** — warm, encouraging, clear, and grounded in method. The Sage
  archetype means *serene and precise, never cold*. Speaks about growth, self-knowledge and people,
  not features or specs. e.g. *"Desenvolver pessoas com método."*, *"Conheça seu perfil e evolua no seu ritmo."*,
  *"Do autoconhecimento à prática."*
- **Person:** address the reader as **"você" / "sua equipe" / "seus alunos"**; the company is
  **"a Vertho"** (or **"nós"** sparingly). Warm second person, never engineer-to-engineer.
- **Casing:** sentence case everywhere. Wordmark is always lowercase **`vertho.ai`**. UPPERCASE only
  for small overline/label text (wide tracking).
- **Vocabulary (do use):** competências, desenvolvimento, DISC, perfil comportamental, trilhas,
  autoconhecimento, mentoria, Mentor IA, evolução, jornada, escolas, empresas, RH, representantes.
- **Vocabulary (avoid — wrong product):** API, tokens, latência, model ID, completions, endpoint,
  SDK, uptime, "developer". This is NOT infrastructure software.
- **Numbers & claims:** human and outcome-oriented (nº de trilhas concluídas, evolução de perfil,
  engajamento de turmas) — not throughput/latency metrics.
- **Emoji:** none in product/marketing chrome; a friendly tick/badge via iconography instead.
- **Vibe:** humano, orientador, confiável, otimista. Método com calor.

## Visual foundations
- **Color:** **navy `#0F2B54` is the primary text/action color** — it's what the live app and PDFs
  lead with. Indigo `#3c385f` (sampled from the logo) is the **logo/wordmark ink only**, not a UI
  text color. Accent system is **cyan → purple**: cyan (`#34c5cc`, the on-dark logo color) primary;
  purple (`#9e4edd`) secondary. A **cyan→purple diagonal gradient** (`--vh-gradient`) is used sparingly
  for highlight moments (progress, hero flourish, level-up). Neutrals are subtly cool-tinted.
- **Type (product system):**
  - **Fraunces** (editorial serif) — display / headings. Warm, human, editorial — the voice of a
    mentor. Set at weight 500–600, tight tracking.
  - **Inter** — body & interface text; the app + PDF default. Regular at 1.6 line-height.
  - **Plus Jakarta Sans** (`--font-ui`) — UI chrome: buttons, labels, nav, subheads, chips.
  - **Codec Cold** (`--font-wordmark`) — **logo/wordmark only**, not a system font.
  - JetBrains Mono exists (`--font-mono`) for the rare data readout; used lightly.
- **Spacing:** 4px base (`--space-1`…`--space-9`). Generous section padding (~80px vertical).
- **Backgrounds:** light `#f7f7fb` page, white cards; dark sections use deepest indigo (`#1c1a33`).
  Soft blurred gradient **glows** for warmth; no busy patterns/textures. No photography in the kit
  (placeholders where real people/classroom imagery would go — this is a warm, people-first brand,
  so real photography of learners/teams is expected in production).
- **Corner radii:** rounded and friendly — 12px (controls), 16px (cards), 24px (dialogs/large
  panels), full pill for buttons/tabs/badges.
- **Cards:** white surface, 16px radius, 1px subtle border, **soft indigo-tinted shadow**. Interactive
  cards lift 3px on hover.
- **Shadows:** tinted `rgba(28,26,51,·)` at low alpha; xs→lg scale. Never harsh black.
- **Buttons:** pill-shaped. Primary indigo; accent cyan; gradient signature; secondary outline; ghost.
- **Motion:** quick, gentle. `--ease-out`; 120/200/340ms. Dialogs fade + rise. No bounces/loops.
- **Hover/press:** buttons darken or gain shadow; ghost sinks; links → ~0.7 opacity; cards lift;
  press scales 0.97.
- **Imagery vibe:** warm, human, hopeful — real people, learners, teams; brand-tinted accents.

## Iconography
- **Set:** [Lucide](https://lucide.dev) — geometric, 2px round-cap stroke. Loaded from CDN and
  rendered via `ui_kits/marketing/Icons.jsx` (`window.Icon`), which reads the `window.lucide` UMD
  global. **Substitution:** no icon set was provided; Lucide is a clean, friendly match. Note: Lucide
  core dropped brand glyphs (GitHub/Twitter/LinkedIn) — use generic names that exist in the set.
- Icons are single-color (`currentColor`), 13–22px in context, tinted with accents for emphasis.
- **No emoji**, no hand-drawn SVGs beyond the brand marks + Lucide.

## Brand assets (`assets/`)
- `icone-escuro.png` / `icone-claro.png` — the V+i icon mark (dark ink / light reversed).
- `logo-h-escuro.png` / `logo-h-claro.png` — horizontal `vertho.ai` lockup (dark / light).
- `logo-ac-escuro.png` / `logo-ac-claro.png` — stacked (icon-above-copy) lockup.
- `fonts/Codec-Cold-*.otf` — wordmark font (logo lockups only).
- Use **dark** ink versions on light backgrounds; **light** versions on indigo/gradient.

---

## Components
Compiled to `window.VerthoDesignSystem_dc3e7c`. Grouped under `components/`.

- **core/** — `Button`, `IconButton`
- **forms/** — `Input`, `Select`, `Checkbox`, `Radio`, `Switch`
- **display/** — `Card`, `Badge`, `Tag`
- **navigation/** — `Tabs`
- **feedback/** — `Dialog`, `Toast`, `Tooltip`

Each directory has `<Name>.jsx`, `<Name>.d.ts`, `<Name>.prompt.md`, and one `@dsCard` HTML.
No component source was provided, so this is a standard primitive set sized to the brand.

## UI kits
- **`ui_kits/marketing/`** — representative Vertho marketing site (competency development: DISC,
  trilhas, Mentor IA no WhatsApp, para escolas e empresas). Illustrative, not a real screen.

## Foundations (Design System tab cards)
- **Brand:** logo lockup, icon mark.
- **Colors:** brand navy (primary + logo-ink swatch), cyan accent, purple accent, neutrals, status & gradient.
- **Type:** display (Fraunces), body (Inter), UI (Plus Jakarta Sans), type scale.
- **Spacing:** spacing scale, radius & shadow.

## Repo index
- `styles.css` — global entry (`@import` manifest only).
- `tokens/` — `fonts.css`, `codec.css`, `colors.css`, `typography.css`, `spacing.css`.
- `components/` — reusable primitives.
- `ui_kits/marketing/` — marketing site recreation.
- `guidelines/` — foundation specimen cards.
- `assets/` — logos, icon marks, wordmark fonts.
- `SKILL.md` — Agent-Skill wrapper for Claude Code.

## Caveats & open questions
- **UI kit is representative, not faithful** — built from the positioning you described (DISC,
  trilhas, Mentor IA, escolas + empresas, representantes), without real screens. **Share the app/
  Figma/screenshots** to make it a true recreation of the product surfaces (aluno, gestor RH, escola,
  representante, PDFs de perfil, chat do Mentor IA).
- **Fonts:** product system = Fraunces + Inter + Plus Jakarta Sans (confirmed by you). Codec Cold is
  wordmark-only. Fraunces & Inter are Google Fonts; Codec Cold is bundled in `assets/fonts/`.
- **Icons:** Lucide substituted (no set provided).
