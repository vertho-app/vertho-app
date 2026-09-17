# Design System Vertho

> Paleta oficial extraída do brand guide (2025-10-24)

> **Dois documentos, dois escopos.** A skill **`.claude/skills/vertho-design`** é a verdade de
> **MARCA** (rampas completas, aliases semânticos, voz do arquétipo Sábio, logos, fontes `.otf`) e
> descreve a **superfície CLARA** — PDFs, proposta, site, slides. **Este arquivo** é a verdade da
> **UI web rodando**, que é **ESCURA**, mais os sub-sistemas com paleta própria (proposta comercial,
> vídeos). Onde os dois divergem em raio, sombra e status, **quem manda numa tela é este**;
> em cor/tipo de marca, manda a skill.

## Paleta Oficial da Marca

| Swatch | Hex | Token CSS | Uso |
|--------|-----|-----------|-----|
| 🟦 | `#9AE2E6` | `--cyan-soft` | Destaques suaves, backgrounds claros |
| 🟦 | `#34C5CC` | `--cyan` | **Acento principal**, CTAs, links, badges |
| 🟦 | `#0F2B54` | `--navy` | **Background principal**, headers, cards |
| 🟪 | `#E1AAEF` | `--lilac` | Acento lilás, secundário |
| 🟪 | `#9E4EDD` | `--purple` | Acento roxo, auditoria, checks |
| 🟪 | `#3B0A6D` | `--purple-deep` | Profundidade, contraste escuro |

## Tokens Funcionais

| Token | Hex | Uso |
|-------|-----|-----|
| `--navy-deep` | `#06172C` | Background gradiente base |
| `--navy-dark` | `#091D35` | Background gradiente meio |
| `--navy-card` | `#0c2039` | Cards internos |
| `--ink` | `#F3F7FB` | Texto principal |
| `--ink-dim` | `rgba(243,247,251,0.62)` | Texto secundário |
| `--ink-faint` | `rgba(243,247,251,0.38)` | Texto muted |
| `--success` | `#2ECC71` | Sucesso, aprovado |
| `--warning` | `#F4B740` | Atenção, parcial |
| `--danger` | `#E74C3C` | Crítico, reprovado |
| `--coral` | `#F97354` | Alerta forte |

⚠️ **Três paletas de status convivem, de propósito** — não "corrigir" um hex para o do DS achando
que é bug: a do app (tabela acima), a dos PDFs (`STATUS_PALETTE = 'vivid'` em
`components/pdf/tokens.ts` → `#16A34A`/`#EA580C`/`#B91C1C`, o default de hoje) e a sóbria da marca
(`'ds'` → `#1F9D6B`/`#D9932B`/`#D6455C`, **opt-in**). Idem na rampa neutra: `NEUTRAL_RAMP = 'slate'`
é o default; a rampa indigo-tinted do DS é opt-in. Detalhe menor: o lilás do app é `#E1AAEF`, o do
bundle de marca é `#E1AAFF`.

## Cor de acento é white-label — não hardcodar

`app/globals.css` declara a rampa **`--brand-100..700`** em `@theme inline` (fallbacks = cyan do
Tailwind, então a Vertho fica pixel-idêntica). `app/dashboard/dashboard-shell.tsx` **sobrescreve
`--brand-*` em runtime** a partir do `accent` do tenant (`brandRampVars`, `color-mix` em oklab), e a
aba Branding consegue puxar a paleta do site do cliente. Em tela de produto use `bg-brand-*` /
`text-brand-*` / `from-brand-*`; escrever `#34C5CC` na mão **quebra o white-label**.

## Tokens de fase (jornada)

`[data-phase="1".."5"]` no shell da página troca `--phase-accent` / `--phase-deep` / `--phase-glow`.
`MetricCard` usa `--phase-accent` como acento padrão e `--line-phase` deriva dele.

| Fase | accent | deep |
|---|---|---|
| 1 | `#9ae2e6` | `#0a1a33` |
| 2 | `#34c5cc` | `#06202a` |
| 3 | `#7ba7e0` | `#1a1f4a` |
| 4 | `#b888e8` | `#1a0d33` |
| 5 | `#e1aaf0` | `#1a0220` |

## Forma: raio, borda, sombra

Definidos em `app/globals.css` com a regra explícita "use estes e só estes":

| Grupo | Tokens |
|---|---|
| Raio | `--radius-sm 10px` (botões/pills/badges) · `--radius-md 16px` (cards internos/chips) · `--radius-lg 24px` (cards principais/hero/modais) |
| Borda | `--line` `rgba(255,255,255,.08)` · `--line-strong` `.14` · `--line-phase` (cor da fase) |
| Sombra | `--shadow-float` (modais/FAB/dropdown) · `--shadow-card` (só onde há elevação real) |

⚠️ As sombras são **pretas** (`rgba(0,0,0,.42)`), não indigo. A regra "sombra tingida de indigo" do
DS de marca vale na superfície clara — em fundo navy o indigo simplesmente some. Não é desvio.

## Tipografia

`app/layout.tsx` carrega 5 famílias por `next/font`. Inter é o default do `<body>`.

| Fonte | Var | Uso | Peso |
|-------|-----|-----|------|
| **Inter** | `--font-inter` | UI, corpo, labels, botões — e corpo dos PDFs | 400–900 |
| **Instrument Serif** | `--font-serif` | **display do produto**: `PageHero`/`SectionHeader` e ~36 telas | 400 |
| **Fraunces** | `--font-fraunces` | display de **marca**: capas de PDF, certificado, `/radarbett`, `/imprensa` | 400–700 |
| **Plus Jakarta Sans** | `--font-jakarta` | eyebrows/labels dos PDFs e do `/radarbett` | 400–800 |
| **Manrope** | `--font-manrope` | eyebrows caixa-alta do radar (`.eyebrow-manrope`) | 500–800 |

Fora dessas: **Dancing Script** é registrada localmente no `lib/certificado-pdf.tsx`, só para a
assinatura. **JetBrains Mono não é carregada** em lugar nenhum e **Codec Cold não existe em código** —
o wordmark é PNG (`lib/pdf-assets.ts`).

## Componentes

`components/ui/` tem só `Button`, `Surface`/`SurfaceHeader`, `MetricCard` e os estados assíncronos;
o layout vem de `components/page-shell.tsx` (`PageContainer`/`PageHero`/`GlassCard`/`SectionHeader`)
e toast é o `sonner`. Props e a11y: `docs/ui-components.md`. Não existem primitivos de
Input/Select/Checkbox/Switch/Badge/Tabs/Dialog/Tooltip.

## Background

```css
body {
  background:
    radial-gradient(1200px 600px at 85% -10%, rgba(52,197,204,0.06), transparent 60%),
    radial-gradient(900px 500px at -10% 30%, rgba(59,10,109,0.12), transparent 60%),
    linear-gradient(180deg, #06172C 0%, #091D35 35%, #0F2B54 100%);
}
```

## Favicon

V cyan (`#34C5CC`) sobre navy (`#0F2B54`) — `app/icon.svg`

---

# Documento da proposta comercial (tema claro/editorial)

> Sub-sistema visual distinto do design system da UI web acima. Aplica-se **apenas** ao documento que o cliente recebe: a página pública `app/proposta/[token]/page.tsx` e o PDF `components/pdf/PropostaComercialPDF.tsx`. Corpo claro/editorial por design (documento formal, impresso e enviado ao cliente), a partir de um template fornecido pelo Rodrigo em 06/07/2026 (`3316392f`). **Redesenhado em 14/09/2026**: o corpo continua claro; a ABERTURA passou a ser uma capa navy da marca, porque a primeira dobra de um documento comercial é onde a decisão começa.

## Paleta (oficial da marca desde 16/09/2026)

Página e PDF leem as cores de **`components/pdf/tokens.ts`** (`brand` + `neutralRamps.indigo`), não
de hex solto. O índigo `#4F46E5`, o índigo-claro `#EEF0FE` e o rosa `#C4488A` do template original
**saíram**: não eram cores da marca.

| Swatch | Hex | Token | Uso |
|--------|-----|-------|-----|
| 🟦 | `#0F2B54` | `brand.navy[500]` | **Navy** — capa, títulos e texto forte, números das métricas, barra de investimento, avatar, botão do WhatsApp |
| ⬛ | `#06152B` | `brand.navy[900]` | Navy profundo — fim do gradiente da capa e da barra de investimento |
| 🟦 | `#2F568C` | `brand.navy[300]` | Navy claro — a "entrega" de cada etapa do cronograma |
| 🟩 | `#34C5CC` | `brand.cyan[500]` | **Cyan** — botão "Aceitar proposta" (com texto NAVY), pontos da timeline, borda do card "cada participante", sublinhado do e-mail |
| 🟩 | `#DBF6F7` | `brand.cyan[100]` | Cyan claro — faixa de métricas, chips do escopo, fundo do check, caixa "proposta aceita" |
| 🟩 | `#9AE2E6` | `brand.cyan[300]` | Rótulos sobre a barra navy · marca-texto de "mede a evolução" |
| 🟩 | `#1C8A90` | `brand.cyan[700]` | Marcadores `›` e check (glifo, não texto) |
| 🟪 | `#9E4EDD` | `brand.purple[500]` | **Roxo** — rótulos de seção (`// Contexto`), numeração 01-04, `✕` do "não incluso" |
| 🌈 | cyan → roxo | gradiente assinatura | Só a borda do bloco de aceite na página (o momento de destaque) |
| ⬜ | `#F7F7FB` · `#E0DEE9` | `neutralRamps.indigo` | Cards cinza e bordas; texto de corpo `#403C56`, secundário `#5A566F` |

⚠️ **O cyan não é cor de TEXTO pequeno sobre claro.** Medido: `#34C5CC` sobre branco dá ~2:1 e até
o `#1C8A90` fica em 4,13:1 (piso 4,5). Por isso ele pinta fundo, ponto, borda e botão, e o texto de
destaque vai em navy (14:1) ou roxo (4,58:1). Botão cyan leva texto **navy** (6,7:1): branco sobre
cyan dá 2:1.

## Tipografia

| Fonte | Uso |
|-------|-----|
| **Space Grotesk** | Títulos, hero, números (valores) |
| **IBM Plex Sans** | Corpo do texto |
| **IBM Plex Mono** | Rótulos de seção (`// Contexto`: 13px/500 na página, 10pt no PDF desde 16/09/2026), meta, footer |

Na página: variáveis `--font-prop-display/body/mono` (com fallback às famílias). No PDF as fontes são registradas localmente via **fontsource** (`Font.register`, CDN jsdelivr) dentro do próprio `PropostaComercialPDF.tsx` — **não** mexe no `styles.ts` compartilhado dos outros PDFs.

## Estrutura (mesma na página e no PDF)

| Seção | Tratamento |
|-------|------------|
| Barra de ação (só na página) | Sticky, `no-print`: nº + validade, "Baixar PDF" e "Aceitar proposta" |
| Capa | Navy com brilho cyan/roxo · logo CLARO · nº/emissão/validade · título · "Preparada para {cliente}" (some se não houver nome) · selo de aceita/expirada · **SEM valor** (decisão do Rodrigo, 16/09/2026: quem lê entende o escopo antes do preço; até então o total ia na primeira dobra) |
| Faixa de métricas | Fundo cyan claro `#DBF6F7` com participantes · cargos · ciclos · duração (vêm do orçamento; sem eles, a faixa some) |
| `// Contexto` | Dor do cliente (quando há) + o argumento institucional |
| `// Como a Vertho trabalha` | 3 pilares: diagnóstico, trilha, evidência |
| `// Por onde já caminhamos` | "Experiências da Vertho e de seus fundadores" + quadro de logos (`public/proposta/trajetoria-logos-2026-09.jpg`, recortado do slide comercial só na área branca). ⚠️ O "e de seus fundadores" fica: nem todo logo é cliente da Vertho. No PDF a imagem é lida por `fs` e precisa estar no `outputFileTracingIncludes` (guard: `tests/unit/proposta-trajetoria-asset.test.ts`) |
| `// Escopo desta proposta` | Chips cyan claro com o texto revisado do orçamento |
| `// O que está incluso` | 8 entregas com título + descrição (check em `<Svg>` no PDF) |
| `// Quem recebe o quê` | Duas colunas: cada participante × a instituição |
| `// Investimento` | Barra navy com o TOTAL + cards (por participante · parcela · parcelas) |
| `// Como funciona` | Timeline de 5 etapas com duração e a entrega de cada uma |
| `// Próximos passos` | Cards numerados 01-04 |
| `// Condições` | Premissas e "o que não está incluso" lado a lado, em cinza |
| Aceite | Formulário (nome, cargo, e-mail + confirmação) na página; no PDF, a chamada equivalente, **presa ao contato** no mesmo bloco sem quebra |
| Contato | Avatar de iniciais + contato da proposta, com WhatsApp e e-mail |
| Footer | Texto mono, cinza |

## Armadilhas MEDIDAS no PDF (14 e 16/09/2026)

1. **`rgba()` não existe para o react-pdf.** `borderTopColor: 'rgba(255,255,255,.16)'` saiu **verde** sobre a capa navy. Os tons de branco vão pré-compostos em hex — e o divisor é um `View` de 1pt preenchido, porque mesmo com hex a BORDA saiu errada.
2. **Glifo fora do subset sai vazio** (ver `tests/unit/pdf-glifos-guard.test.ts`): `✓`, `✕` e `→` desapareceram sem erro. Check e xis viraram `<Svg>`; a seta virou o rótulo "Entrega:".
3. **Seções partidas entre páginas (16/09/2026).** O contato caía sozinho numa 5ª página em branco, e o título "O que está dimensionado aqui" ficava no pé da página 1 com um chip cortado ao meio. A regra que fechou, em `Secao`:
   - **Seção inteira por padrão** (`wrap={false}`), porque corrigir uma seção por vez não fecha: segurar o escopo empurrou "Quem recebe o quê" e deixou o título DELA órfão. `minPresenceAhead` no rótulo/título foi medido e não segurou.
   - ⚠️ **Inteira só para tamanho CONHECIDO.** Com 30 itens de escopo injetados, a seção maior que a página sobrepôs o texto e perdeu itens (o react-pdf avisa `can't wrap between pages and it's bigger than available page height` e segue). Das listas do documento, só o **escopo** vem de dado (`included_scope`); ele passa `podeQuebrar`, quebra por **linha de chips** e leva a primeira linha presa ao título (`primeiraLinha`). Contexto e observações (texto livre) também passam `podeQuebrar`.
   - Chamada de aceite + contato num único `View wrap={false}`.
   - Verificação: renderizar a proposta real **e** o caso injetado, e olhar cada página (`scripts/_render-proposta-pdf.ts`, local e fora do git, aceita `INJETAR_GRANDE=1`).

---

# Templates de cena de vídeo (Remotion)

> Sub-sistema visual distinto do design system da UI web acima. Aplica-se **apenas** aos vídeos de microlearning (avatar + cenas animadas via Remotion), em `video-spike/remotion/scenes/*.tsx`.

## Tema dos vídeos

Tema/paleta próprios em `video-spike/remotion/theme.tsx` e `theme-v2.tsx`.

| Elemento | Descrição |
|----------|-----------|
| Fundo | Escuro azul-marinho com glow ciano/roxo |
| Tipografia | Inter |
| Marca | Marca d'água `vertho.ai` |
| Apoios | Barra de progresso, legendas discretas |

## Regras visuais

| Regra | Descrição |
|-------|-----------|
| Resolução | 1920×1080 (renderizado a 720p ou 1080p) |
| Sequência | Nunca o mesmo template em cenas adjacentes |
| Ritmo | Intercalar cenas densas com "respiros" |

## Os 13 templates de cena

| Template | Descrição |
|----------|-----------|
| `avatar_intro` / `avatar_outro` | Avatar apresentador (HeyGen) com título + subtítulo sobrepostos. Abertura e fecho. |
| `concept_reveal` | Título grande + 3 bullets que entram em sequência com ícones. |
| `comparison_motion` | Duas colunas contrastando "prática fraca" × "prática desejada", 3 itens cada. |
| `icon_story` | 3 cards com ícone (sinais/exemplos/comportamentos). |
| `steps_flow` | Processo em passos numerados conectados por uma linha que se desenha (1→2→3→4). |
| `stat_highlight` | Um número/percentual gigante com count-up animado + contexto. |
| `quote_spotlight` | Frase-âncora memorável em tela limpa, com aspas decorativas. |
| `scenario_card` | Abre uma situação típica ("Imagine...") com ícone + texto curto. |
| `maturity_ladder` | Régua de maturidade (N1→N4): degraus ascendentes, degrau-meta aceso com rótulo "META". |
| `myth_truth` | Quebra de equívoco: o MITO é riscado e a VERDADE (ciano) assume a tela. |
| `definition_card` | Define um termo em card centralizado (termo grande + definição + hairline). |
| `reflection_prompt` | Pergunta de reflexão no meio do vídeo, tela limpa com pulso ciano. |
