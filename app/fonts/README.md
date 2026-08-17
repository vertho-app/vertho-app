# Fontes servidas do repo

Arquivos `.woff2` (subset **latin**) das famílias usadas em `app/layout.tsx` e
`app/proposta/[token]/page.tsx`, carregados por `next/font/local`.

## Por que estão aqui, e não em `next/font/google`

O `next/font/google` baixa a fonte em **build time**. O cache não sobrevive entre execuções do CI,
então todo build passava a depender da rede do Google — e ela falhou **quatro vezes em dois dias**
(15-17/08/2026):

```
Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
TypeError: fetch failed  ·  Caused by: Error: read ECONNRESET   (@react-pdf/font)
```

Todas passaram no re-run — ou seja, vermelho que não é do diff. **Vermelho intermitente é pior que
vermelho:** ele treina quem olha a re-rodar sem ler, que foi exatamente como cinco commits ficaram
quebrados por 3h em 13/08.

Para o navegador nada muda: o `next/font` já servia do nosso domínio. O que mudou é de onde o
**build** tira o arquivo.

## Como foram obtidos

Da API CSS2 do Google Fonts, com UA de Chrome (é o que faz devolver `woff2`), pegando o bloco cujo
`unicode-range` cobre o latim básico (`U+0000-00FF`). Arquivo **variável** quando a família tem eixo
de peso — daí `weight: "200 800"` no `localFont` em vez de um arquivo por peso.

Para atualizar ou acrescentar uma família, refaça o mesmo caminho e confira o `weight` declarado no
`localFont` contra os pesos que o CSS realmente entrega. ⚠️ Declarar um intervalo que o arquivo não
cobre não dá erro: o navegador sintetiza o peso, e o texto fica sutilmente diferente sem nada acusar.

## Licenças

Todas sob **SIL Open Font License 1.1**, que permite redistribuição inclusive embutida:

| Arquivo | Família | Autoria |
|---|---|---|
| `inter.woff2` | Inter | Rasmus Andersson |
| `manrope.woff2` | Manrope | Mikhail Sharanda |
| `jakarta.woff2` | Plus Jakarta Sans | Tokotype |
| `instrument-serif*.woff2` | Instrument Serif | Instrument |
| `fraunces*.woff2` | Fraunces | Undercase Type |
| `space-grotesk.woff2` | Space Grotesk | Florian Karsten |
| `ibm-plex-sans-*.woff2` · `ibm-plex-mono-*.woff2` | IBM Plex | IBM / Bold Monday |

A OFL exige que o texto da licença acompanhe a fonte quando ela é redistribuída **como fonte**
(pacote, download). Aqui elas são servidas como asset de uma aplicação web, que é o uso normal e
previsto — mas se um dia forem oferecidas para download, o `OFL.txt` de cada família precisa vir
junto.
