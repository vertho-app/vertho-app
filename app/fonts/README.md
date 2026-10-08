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

Todas livres, **exceto o Codec Cold** (seção própria abaixo). OFL 1.1 para a maioria, que permite
redistribuição inclusive embutida; a **Roboto é Apache 2.0**:

| Arquivo | Família | Autoria |
|---|---|---|
| `roboto.woff2` | Roboto (variável, Apache 2.0) | Christian Robertson / Google |
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

## Codec Cold Extra Bold (títulos): licença COMERCIAL

`codec-cold-extrabold.woff2` é o único arquivo daqui que **não** é livre. Família Codec Cold, da Zetafonts
(Cosimo Lorenzo Pancini e Francesco Canovaro). O brand book de out/2026 manda "Codec Bold" nos títulos, mas a amostra do slide é bem mais pesada que o corte
Bold da família (que é médio): o dono comparou Bold, Extra Bold e Heavy e escolheu o **Extra Bold** em 08/10/2026.
Para trocar de peso, substitua este arquivo e o OTF dos PDFs mantendo os nomes (ou renomeie nos 4 lugares do guard).

- **Licença.** O OTF gratuito que veio na skill `vertho-design` (`Codec-Cold-Bold.otf`, e os 44 do kit CODEC) trazem no próprio
  arquivo uma EULA de **uso pessoal e não comercial**, que "não vale para entidades corporativas", "não cobre
  embutir em software" e proíbe redistribuir e criar obra derivada; webfont e fonte de tela pedem licença de
  software (zetafonts.com/licensing). O dono atestou ter essa licença em 08/10/2026. **O arquivo que está
  aqui deve ser o do kit licenciado**; se a Zetafonts entregou um kit web, troque o arquivo mantendo o nome
  e nada mais muda.
- **Como foi obtido.** O `.woff2` é a conversão sem perda do `Codec-Cold-Extra-Bold.otf` (do kit CODEC) (fontTools + brotli, os
  1107 glifos intactos; cobre todo o português). Nenhum glifo foi editado.
- **Só existe o peso 800**, e o `app/layout.tsx` declara a MESMA face também como `italic`: sem isso o
  navegador sintetiza um oblíquo por cima do Codec nos títulos que eram itálicos. Títulos que pedem 400
  saem em 800 (é a face que existe).
- **PDFs.** O `react-pdf` não lê woff2: usa o OTF em `lib/pdf-fontes/CodecCold-ExtraBold.otf` (fora de `public/`,
  para não ser baixável por URL), registrado em `components/pdf/fontes.ts`. É lido por `fs`, então precisa
  estar no `outputFileTracingIncludes` do `next.config.mjs` e no `additionalFiles` do `trigger.config.ts`;
  sem o arquivo no pacote os títulos caem para Roboto, sem erro.
