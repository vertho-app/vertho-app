# Design system — Simulador do Consultor (`ui/`)

Biblioteca de componentes **reutilizáveis, acessíveis e prontos para produção** que dá
base ao simulador white-label do consultor (`app/simulador-consultor/page.jsx`).

> Por que existe: o `page.jsx` começou como um mock com estilos inline repetidos
> (cards, chips, barras, abas, modais). Esta camada extrai os padrões em primitivos
> testáveis, com ARIA correto, estados de carregamento e responsividade — sem perder
> o **white-label** (tudo segue as CSS vars de tema do app).

---

## Arquitetura

```
ui/
├─ styles.jsx      # <UIStyles/> — ÚNICA fonte de CSS (classes ds-*, animações, a11y, responsivo)
├─ primitives.jsx  # Button, IconButton, Card, Badge, Meter, KpiCard, Skeleton, EmptyState, Spinner, VisuallyHidden
├─ Tabs.jsx        # Tabs/TabList/Tab/TabPanel acessíveis (WAI-ARIA Tabs)
├─ Dialog.jsx      # Modal acessível (focus trap, Escape, restore focus, scroll lock)
├─ Field.jsx       # Field/TextField/SelectField (label↔controle, aria-describedby/invalid)
├─ index.js        # barrel — importe sempre daqui
└─ README.md
```

**Princípios de design**

1. **Theming por CSS vars, não por props de cor.** Todo componente lê `--accent`,
   `--card`, `--line`, `--ink`, `--dim`, `--faint` (com fallback). Trocar a marca do
   parceiro re-skina a UI inteira sem tocar em componente. Tons semânticos
   (`success`/`warning`/`danger`/`info`) são fixos; `accent` segue a marca.
2. **Acessível por padrão, não como opção.** Foco visível, ARIA, navegação por teclado
   e `prefers-reduced-motion` vêm de fábrica. Significado nunca depende só de cor
   (ex.: `Badge dot` + texto).
3. **CSS único, sem inline repetido.** Estados de `:hover`/`:focus-visible`/animações
   vivem em `<UIStyles/>` (classes `ds-*`). Inline só para valores dinâmicos (largura
   de barra, cor do tom).
4. **Composição > configuração.** Primitivos pequenos que se combinam, em vez de um
   componente gigante com 20 props.

**Setup** — renderize `<UIStyles/>` uma vez perto da raiz e marque o container com
`className="ds-root"` (onde as CSS vars de tema são definidas):

```jsx
import { UIStyles } from "./ui";

<div className="ds-root" style={{ "--accent": partner.accent, /* ... */ }}>
  <UIStyles />
  {/* app */}
</div>
```

---

## Props design (resumo)

### `Button`
| prop | tipo | default | nota |
|---|---|---|---|
| `variant` | `primary \| ghost \| subtle \| danger` | `ghost` | |
| `size` | `sm \| md` | `md` | |
| `icon` / `iconRight` | componente lucide | — | decorativo (`aria-hidden`) |
| `loading` | boolean | `false` | mostra spinner, aplica `aria-busy` e desabilita |
| `disabled` / `block` | boolean | `false` | |

`IconButton` é botão só de ícone: **`label` é obrigatório** (vira `aria-label` + `title`).

### `Meter` (barra de progresso acessível)
| prop | tipo | default | nota |
|---|---|---|---|
| `value` | number | — | valor atual |
| `min` / `max` | number | `0` / `100` | use `max={4}` para níveis 1–4 |
| `tone` | tom semântico **ou** cor CSS | `accent` | |
| `label` | string | — | vira `aria-label` |
| `format` | `(v)=>string` | `${v}%` | texto exibido + `aria-valuetext` |

Renderiza `role="progressbar"` com `aria-valuenow/min/max/valuetext`.

### `Badge`
`tone` (semântico ou cor), `dot` (marcador — garante leitura sem depender de cor),
`icon`. Conteúdo textual é o rótulo.

### `Tabs` / `TabList` / `Tab` / `TabPanel`
Controlado: `value` + `onValueChange`. `<Tabs label>` rotula o `tablist`.
`<Tab value badge>` (o `badge` vira um `<sup>`, ex.: a fase `F1`).
Teclado: `←/→/↑/↓` navegam e ativam, `Home`/`End` vão às pontas; roving `tabindex`.
`<TabPanel value>` só monta quando ativo e já liga `aria-labelledby`/`tabindex`.

### `Dialog`
`open`, `onClose`, `title`, `description`, `footer`, `size`, `closeOnOverlay`,
`initialFocusRef`. Faz **focus trap**, fecha no `Escape`, **devolve o foco** ao
gatilho, trava o scroll do body e expõe `role="dialog"` + `aria-modal` +
`aria-labelledby`/`describedby`. Foco inicial vai para `[data-autofocus]` se existir.

### `Field` / `TextField` / `SelectField`
Associam `<label htmlFor>` ao controle (id gerado por `useId`), ligam `hint`/`error`
via `aria-describedby` e marcam `aria-invalid`/`aria-required`. `error` é anunciado
com `role="alert"`.

### Estados
- `KpiCard` aceita `loading` → skeleton no número.
- `Skeleton` / `SkeletonText` → placeholders (`aria-hidden`; marque o pai com `aria-busy`).
- `EmptyState` (`icon`, `title`, `description`, `action`, `compact`) → vazio / sem
  resultado / erro, com `role="status"`.

---

## Exemplos de uso

```jsx
import {
  Button, IconButton, Meter, Badge, KpiCard, EmptyState,
  Tabs, TabList, Tab, TabPanel, Dialog, TextField, SelectField,
} from "./ui";
import { Plus, Bell, SearchX } from "lucide-react";

// Botão com loading
<Button variant="primary" icon={Plus} loading={saving} onClick={save}>Salvar</Button>

// Botão só de ícone (label obrigatório)
<IconButton icon={Bell} label="Notificações" />

// Barra acessível em escala 1–4
<Meter label="Comunicação" value={3.1} max={4} format={(v) => `${v.toFixed(1)} / 4`} />

// Status sem depender de cor
<Badge tone="success" dot>Saudável</Badge>

// KPI com carregamento
<KpiCard label="Colaboradores" value={128} sub="acompanhados" icon={Users} loading={loading} />

// Abas acessíveis
<Tabs value={tab} onValueChange={setTab} label="Seções da empresa">
  <TabList>
    <Tab value="visao">Visão geral</Tab>
    <Tab value="diagnostico" badge="F1">Diagnóstico</Tab>
  </TabList>
  <TabPanel value="visao"><Visao /></TabPanel>
  <TabPanel value="diagnostico"><Diagnostico /></TabPanel>
</Tabs>

// Modal acessível com formulário
<Dialog open={open} onClose={close} title="Nova empresa-cliente"
  footer={<>
    <Button variant="ghost" onClick={close}>Cancelar</Button>
    <Button variant="primary" disabled={!nome.trim()} onClick={save}>Criar</Button>
  </>}>
  <TextField label="Nome" required data-autofocus value={nome} onChange={(e) => setNome(e.target.value)} />
  <SelectField label="Segmento" value={seg} onChange={(e) => setSeg(e.target.value)}>
    <option>Educação · K-12</option>
  </SelectField>
</Dialog>

// Estado vazio / sem resultado
<EmptyState icon={SearchX} compact title="Nada encontrado" description="Tente outro termo." />
```

---

## Acessibilidade — checklist coberto

- **Teclado:** abas (setas/Home/End), modal (Tab cíclico + Escape), tudo focável é
  `<button>`/`<a>` real (não `div onClick`).
- **Foco:** anel `:focus-visible` consistente; modal devolve o foco ao gatilho.
- **ARIA:** `tablist/tab/tabpanel`, `dialog`+`aria-modal`, `progressbar` com valores,
  `aria-current` na navegação, `aria-pressed` no seletor de marca, `role="alert"` em erros.
- **Leitores de tela:** ícones decorativos com `aria-hidden`; `IconButton` exige
  `label`; tabelas com `scope`/`<caption>` (sr-only); `VisuallyHidden` para rótulos.
- **Cor:** nunca é o único portador de significado (badges com `dot`+texto).
- **Movimento:** `@media (prefers-reduced-motion: reduce)` zera animações.

## Responsividade

`<UIStyles/>` traz utilitários: `.ds-shell`/`.ds-sidebar` (sidebar vira barra
horizontal < 820px), `.ds-grid-2` (2 colunas → 1 < 820px) e `.ds-grid-portfolio`
(< 920px). Tabelas usam wrapper com `overflow-x:auto`; a topbar e a tablist quebram
com `flex-wrap`.

## Migração / convivência com o legado

O `page.jsx` ainda tem um `<style>` legado com classes `.card/.btn/.chip/.bar/.row/.fld`
usadas pelos corpos de aba mais antigos. Elas mapeiam 1:1 para os primitivos
(`.card`→`Card`, `.btn`→`Button`, `.chip`→`Badge`, `.bar`→`Meter`). A migração é
incremental: novos blocos usam a lib; os antigos seguem funcionando até serem trocados.
