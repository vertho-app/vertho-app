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
