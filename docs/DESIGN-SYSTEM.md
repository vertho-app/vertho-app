# Design System Vertho

> Extraído do handoff `vertho-handoff.zip` (Claude Design, 2026-04-17)

## Cores

| Token | Hex | Uso |
|-------|-----|-----|
| `--navy-deep` | `#06172C` | Background principal / body |
| `--navy` | `#0F2A4A` | Cards, headers, elementos elevados |
| `--navy-dark` | `#091D35` | Background gradiente |
| `--navy-card` | `#0c2039` | Cards internos |
| `--cyan` | `#34C5CC` | Acento principal, links, CTAs |
| `--cyan-bright` | `#00B4D8` | Variação brilhante |
| `--cyan-soft` | `#9AE2E6` | Textos de destaque suave |
| `--teal` | `#0D9488` | Acento secundário (dicas, tips) |
| `--violet` | `#7C3AED` | Acento terciário (auditoria, checks) |
| `--ink` | `#F3F7FB` | Texto principal (quase branco) |
| `--ink-dim` | `rgba(243,247,251,0.62)` | Texto secundário |
| `--ink-faint` | `rgba(243,247,251,0.38)` | Texto terciário / muted |
| `--good` / `--success` | `#2ECC71` | Sucesso, aprovado |
| `--coral` | `#F97354` | Erro, alerta forte |
| `--gold` / `--warning` | `#F4B740` | Atenção, parcial |
| `--danger` | `#E74C3C` | Crítico, reprovado |

## Tipografia

| Fonte | Uso | Peso |
|-------|-----|------|
| **Inter** | UI, corpo, labels, botões | 400–900 |
| **Instrument Serif** | Títulos display, números de seção | 400 (normal + italic) |
| **Fraunces** | Headings editoriais (relatórios) | 400–700 |
| **JetBrains Mono** | Código, badges técnicos | 400–700 |

## Background

```css
body {
  background:
    radial-gradient(1200px 600px at 85% -10%, rgba(52,197,204,0.06), transparent 60%),
    radial-gradient(900px 500px at -10% 30%, rgba(124,58,237,0.08), transparent 60%),
    linear-gradient(180deg, #06172C 0%, #091D35 35%, #0A1F3A 100%);
}
```

## Superfícies

| Tipo | Background | Border |
|------|-----------|--------|
| Card glass | `rgba(255,255,255,0.03)` | `var(--line)` |
| Card elevado | `var(--navy-card)` | `var(--line-strong)` |
| Card accent | `rgba(52,197,204,0.05)` | `rgba(52,197,204,0.18)` |

## Bordas arredondadas

| Elemento | Radius |
|----------|--------|
| Cards principais | `20px` |
| Cards internos | `14px` |
| Botões | `12px` |
| Badges | `10px` |
| Inputs | `12px` |

## Arquivos fonte

- `vertho-handoff.zip` (em `docs/`) contém protótipos HTML completos:
  - `Tipografia.html` — guia tipográfico
  - `Design Review.html` — review visual completo
  - `assets/` — logos PNG
