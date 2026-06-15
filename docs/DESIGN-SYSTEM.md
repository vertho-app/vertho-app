# Design System Vertho

> Paleta oficial extraída do brand guide (2025-10-24)

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

## Tipografia

| Fonte | Uso | Peso |
|-------|-----|------|
| **Inter** | UI, corpo, labels, botões | 400–900 |

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

## Os 9 templates de cena

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
