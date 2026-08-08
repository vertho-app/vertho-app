# CONARH 52 — Sprint do App (consolidado)

Plano de engenharia e operação da rota `/conarh`. Consolida a **Proposta Resumida de Operação** e o **Sprint do App** (ambos de 29/07/2026), reconciliado com o estado real do produto.

- **Janela:** 29/07 → 17/08/2026 · feira 18–20/08
- **Métrica-mãe:** reuniões realizadas em 30 dias (não "quantos pararam")
- **Aceite final:** nenhum ponto crítico depende de rede
- **Regra que rege:** a demo existe a serviço do agendamento. Qualificou, corta e marca.

> **Escopo deste documento.** Aqui está o que o **app** precisa ter, com prioridade, aceite e gate.
> A **operação de fala** — os quatro movimentos da abordagem, o MOSTRA/FALA/GANCHO de cada porta,
> o fecho, a resposta a preço e as objeções decoradas — vive na **Proposta Resumida de Operação**
> e não é duplicada aqui: ela muda no ensaio, este doc muda no código, e duas cópias divergem.

---

## 0. Estado real — leia antes de planejar

A rota `/conarh` **existe e está implementada** (commit `47eec490`, 29/07/2026). A premissa de que "não existe no produto — é entrega a construir", herdada dos dois PDFs de origem, **está vencida**.

| Frente | Estado | Onde |
|---|---|---|
| F1 hub, template de rota, reset entre visitantes | ✅ | `app/conarh/_components/{hub,porta-shell,conarh-app}.tsx` |
| F1 · P1 modo opt-in no celular do visitante | ⚠️ parcial — o formulário reduzido existe (`modoVisitante`), falta o QR | `captura.tsx` |
| F2 porta 2 interativa — **cenário respondido (4 perguntas IA3) + classificação** desde 05/08 (§0.2) | ✅ | `porta2.tsx` · `lib/conarh/leitura.ts` · `_components/reguas.ts` |
| F2 · três réguas trocáveis nas etapas **1 e 2** (Liderança · Vendas · Transversal) | ✅ 04-05/08 | `seletor-regua.tsx` · `reguas.ts` · `conteudo.json` |
| F2 · fluxo da etapa 2 verificado no navegador (headless) | ✅ 05/08 — 20/20 asserções, 0 erro de console | receita na memória `reference_verificacao_navegador` |
| F2 · P2 benchmark ao vivo (n ≥ 7) | ❌ não construído (é P2) | — |
| F3 caso canônico, 5 portas, 5 personas, mídia local | ✅ | `_data/conteudo.json` · `public/conarh/media/` |
| F3 caso canônico **validado com 3 clientes** | ❌ **pendente — caminho crítico** | fora do código |
| F3 · P1 2 casos-reserva no mesmo schema | ✅ `delegacao`, `conversa-dificil` | `conteudo.json` |
| F3 · P1 recorte do caso real (rede, 36 pessoas) | ❌ depende de autorização | — |
| F4 formulário, origem, LGPD, classe, alerta de A | ✅ | `captura.tsx` · `actions/lead-comercial.ts` |
| F4 · P1 fila do dia | ✅ | `/conarh/fila` |
| F5 recorte por WhatsApp + e-mail, fila offline | ✅ | `api/conarh/artefato` · `capture.ts` |
| F5 · P1 Mapa da Evolução | ✅ | `/conarh/mapa/[id]` |
| F6 · P1 agenda na hora | ⚠️ **revertido 04/08** — sem seletor no tablet; o fechador marca (§0.1) | `diag_leads.reuniao_em` segue no schema |
| F7 telemetria + painel diário | ✅ | `lib/radar/eventos.ts` · `api/conarh/painel` |
| F8 · P1 régua T+0 → T+5 | ✅ | `lib/conarh/regua.ts` + cron `conarh-followup` |
| F9 degustação · F10 infraestrutura | ❌ fora do código — ver §5 | — |

**O que resta de engenharia é conferência, não construção.** O caminho crítico da sprint passou a ser o **caso canônico validado com 3 clientes** (§7, semana 1) e a **verificação por presença** (§9).

Migração de banco: `196-conarh-lead-sessao.sql` (porta, competência, horizonte, classe, reunião, sessão, passo da régua).

### 0.1 Rodada de 04/08/2026 — o que MUDOU depois da sprint

Cinco decisões de produto tomadas dirigindo a demo na tela, não no papel. **Onde este
documento descrever o comportamento antigo, vale esta seção** — os bullets superados estão
marcados com ⚠️ no corpo.

| Mudou | De → para | Por quê |
|---|---|---|
| **Vocabulário** | "porta" → **"etapa"** em tudo que o visitante lê | "Porta" é o nome do componente. A tela sempre disse "etapa"; o follow-up dizia "porta 1". Interno (fila do fechador, insight) segue com o jargão. |
| **Etapa 1** | uma régua → **três** (Liderança · Vendas · Transversal), trocáveis num toque | A matriz só se provava em liderança; o visitante de vendas tinha que acreditar que "vale pra mim". Só a régua do CASO segue nas etapas 3–5. |
| **Etapa 2** | registro escrito → **cenário situacional + 4 respostas** ⚠️ *(superado em 05/08, §0.2)* | O registro fazia a demo parecer depender de um gestor com boa memória escrevendo um relatório bom. Agora roda o artefato real — e, desde 05/08, o visitante classifica o cenário respondido em vez de escolher entre respostas. |
| **Escolha da competência** | só na etapa 1 → **também na etapa 2** (05/08) | O expositor abre direto a etapa que o visitante apontou; quem entra assim nunca passou pela etapa 1 e respondia o cenário de liderança sem ter escolhido nada. Seletor único (`seletor-regua.tsx`) nas duas telas — trocar no meio do fluxo **reseta para o passo 1**, porque a escolha anterior era o id de uma resposta de outro cenário. |
| **Formulário** | 4 toggles → **1** ("aceitou um próximo passo") + sem seletor de horário | Enxugar o toque no tablet. Consequências tratadas nas duas linhas abaixo. |
| **Fecho de etapa** | 2 CTAs → **1** ("Receber esse recorte") | Sem o seletor de horário, "Marcar os 20 minutos" abria a mesma tela — dois botões idênticos com nomes diferentes. |

**Duas consequências que NÃO podiam ficar implícitas:**

1. **Régua A/B/C** (`lib/conarh/classificacao.ts`): `decide_ou_recomenda` saiu do predicado de A.
   Com o campo fora da tela, A ficaria inalcançável e todo lead conduzido cairia em B — o alerta
   de < 30 s do fechador morreria em silêncio. **A = dor clara + horizonte quente + próximo
   passo.** `fora_do_perfil` segue vencendo tudo no contrato, mas já não chega por esta tela: C
   só acontece pela regra automática.
2. **Telemetria e painel**: `nota_instintiva` / `reavaliacao` / `divergencias` foram **removidos**
   (mediam o mecanismo antigo). Entra `sessao.cenario` com `nivel_aceito` × `nivel_meta`, e o
   número publicável vira **"N de M gestores aceitariam uma resposta abaixo da meta N3"**. Leads
   anteriores a 04/08 ficam FORA da conta — as duas réguas de medida não são comparáveis. Cache
   do painel: `conarh:cache-painel-v2` → `v3`. ⚠️ **Superado em 05/08 — ver §0.2.**

### 0.2 Rodada de 05/08/2026 — a etapa 2 vira CLASSIFICAÇÃO

O visitante deixou de escolher "qual resposta eu aceitaria" e passou a fazer o **mesmo trabalho
da régua**: ele lê o cenário respondido (as **4 perguntas que a IA3 gera** + as respostas da
pessoa avaliada) e o **classifica num nível**; depois compara com a leitura da régua sobre o
mesmo material.

As perguntas seguem a régua do prompt real (`lib/ia3-cenarios.ts`), não um roteiro de entrevista:
**P1 escolha com custo · P2 execução sob resistência · P3 tensão humana · P4 sustentação**, todas
abertas, em 2ª pessoa, ≤200 caracteres e com decisão forçada. Na 1ª versão desta rodada elas
foram escritas como follow-up conversacional ("ficou marcada alguma data?") — a tela que existe
para provar o instrumento estava exibindo um artefato que a plataforma não gera. Os quatro focos
aparecem na tela como rótulo: é o que separa instrumento de questionário, e é onde o expositor
aponta o dedo.

| Mudou | De → para | Por quê |
|---|---|---|
| **Mecanismo do toque** | escolher entre 4 respostas → **classificar o cenário respondido em N1–N4** | Escolher entre quatro textos que nós escrevemos media o gosto do visitante. Classificar põe ele e a régua olhando **exatamente o mesmo material** — a única comparação honesta, e a única que sustenta a frase "a régua não muda de gestor para gestor". |
| **O que a tela mostra** | 1 situação + 4 respostas hipotéticas → 1 situação + **as 4 perguntas da IA3 respondidas** | É o artefato que a engine produz de verdade, com os focos na ordem do prompt. A pessoa avaliada aparece com nome e cargo (Renata · Marcelo · Sérgio, um por régua). |
| **Fecho da etapa** | "as quatro respostas, na régua" → **resposta a resposta, com o trecho que ancora cada nível** + bloco "a régua não tem viés" | "Auditável" deixa de ser adjetivo: cada nível vem com o pedaço da fala em que se apoia. |
| **Nota** | não existia → **derivada em código** (`lib/conarh/leitura.ts`), média dos níveis das 4 respostas | Nota gravada à mão diverge do conteúdo no primeiro ajuste e a tela passa a mostrar uma média que não é a média. Guard novo amarra a nota da etapa 2 (1,5 · N1) ao texto do PDI da etapa 3 — as duas telas falam do mesmo descritor da mesma pessoa. |
| **Nota → nível** | `Math.round` → **`Math.floor` com clamp 1–4** | A conversão estava arredondando: 1,5 aparecia como **N2**. O motor faz `floor` em quatro pontos independentes (`actions/fase3.ts` ×3, `lib/blueprint/core.ts`, `lib/relatorio-individual-prompt.ts`) — a semântica é "atingiu o nível", e 1,5 é meio caminho do N2. Junto vieram **3 dos 6 descritores do caso** (`leitura_motor`), que traziam o nível arredondado e apareciam assim na PRANCHETA de papel: 2,6·N3 → N2, 1,9·N2 → N1, 1,8·N2 → N1. Guards novos travam as duas coisas. |
| **Telemetria** | `nivel_aceito` × `nivel_meta` → **`nivel_atribuido` × `nivel_regua`** (+ `nota_regua`) | Terceiro contrato desta etapa; nome velho medindo coisa nova é como o painel mente. O número publicável vira **"N de M gestores classificaram a conversa ACIMA do que a régua lê"**. Leads anteriores a 05/08 ficam fora da conta. Cache do painel: `v3` → `v4`. |

⚠️ **A allowlist do servidor é parte do contrato, não detalhe**: `sanitizarSessaoConarh`
(`actions/lead-comercial.ts`) copia só as chaves conhecidas. Trocar o nome do campo no cliente
sem trocar lá derruba a sessão inteira **em silêncio** — o lead grava, o painel conta zero. Quem
pegou foi o teste de contrato (`lead-comercial-contato`), não o typecheck.

Verificado no navegador headless em 05/08: **20/20 asserções, 0 erro de console** — incluindo as
duas que garantem que a leitura da régua (trecho, justificativa e nota) **não vaza** na tela em
que ele ainda vai classificar, e a que confere os quatro focos da IA3 na ordem.

**A prancheta (`/conarh/prancheta`) continua no fluxo do registro escrito** — é papel, não tem
toque nem estado. Por isso o bloco `porta2` do `conteudo.json` (registro + leitura do motor)
segue vivo: apagá-lo deixa o plano B da feira em branco. ⏳ Pendente decidir se o papel espelha
o cenário.

Guardas de conteúdo e de texto (falham no CI, validadas por mutação):
`tests/unit/conarh-conteudo.test.ts` (toda régua com cenário e pessoa avaliada; 4 perguntas com
foco/pergunta/resposta/trecho/leitura; **focos na ordem da IA3, abertas e ≤200 chars, contexto
≤900**; conjunto lido abaixo da meta com níveis distintos; descritor testado existindo na matriz;
nota da etapa 2 = nota citada na etapa 3) e
`tests/unit/conarh-mensagens.test.ts`
(o follow-up não pode dizer "porta" nem "quem decide", nem colar o nome da empresa depois de
artigo fixo).

### 0.3 Ainda em 05/08/2026 — competências, navegação e insumos do PDI

| Mudou | De → para | Por quê |
|---|---|---|
| **As 3 competências** | Feedback e Desenvolvimento de Pessoas · Condução de Venda Consultiva · Resolução de Problemas → **Liderança · Relacionamento com Clientes · Resolução de Problemas** | São as três que a feira vende. "Feedback" era um recorte de liderança (virou o descritor LID-D04) e "venda consultiva" falava só de venda nova — quem tem carteira não se via. Códigos: `LID-*`, `REL-*`, `RSP-*`. Guard trava os três nomes: eles saem em lona, folder e fala. |
| **Descritores por régua** | 6 · 5 · 5 → **6 em todas** | O seletor põe as três lado a lado: régua mais curta que a vizinha faz o visitante achar que a competência DELE foi tratada por cima. |
| **Régua de Relacionamento** | — | Cenário próprio (implantação atrasada 3 semanas, cliente ameaçando cancelar no comitê de sexta), ancorado em REL-D04 · Recuperação de confiança. Avaliada: Juliana, gerente de contas. Nota 1,8 · N1. |
| **Navegação** | só "As 5 etapas" (hub) → **botão "Voltar"** em toda tela que tem anterior | O expositor precisava de um passo atrás sem perder a sessão. Pilha explícita no `conarh-app` (o botão do browser sairia de `/conarh` e mataria a demo na frente do visitante). Na etapa 2, "Voltar" anda **um passo**, não a tela inteira; na confirmação a pilha é zerada, senão o expositor reenviaria o mesmo lead. |
| **Etapa 3 (PDI)** | "cruzamento entre a matriz e o diagnóstico" → **+ perfil comportamental (DISC) + modelo de aprendizagem** | "O plano é automático" soa a template até o visitante ver o que cada insumo decidiu: o DISC define o COMO (missão em uma frase, ritual de 15 min) e a preferência de aprendizagem define o FORMATO (missão prática, não curso). É o mesmo par que a etapa 4 mostra no espelho — aqui na origem. Os 4 insumos aparecem na tela com valor e efeito, e um guard trava a lista. |
| **Etapa 3 · PDF real** | só cards na tela → **o PDF que a pessoa recebe**, com prévia da capa e link | O que o cliente leva é um PDF; a etapa terminava sem mostrá-lo. Gerado pelo componente do produto a partir do `conteudo.json` (`scripts/_conarh-pdi-pdf.ts`), 6 páginas, versionado (modo avião). Guard confere que o arquivo existe, que a tela aponta para ele e que os arquivos de inspeção do pdf.js **não** foram versionados. |


### 0.4 Rodada de 05-06/08/2026 — peças reais e modo avião

| Mudou | Onde |
|---|---|
| **A demo abre os documentos**, não os descreve: PDI (etapa 3), guia escrito + podcast + relatório comportamental (etapa 4), gestor/RH/perfil organizacional/DNA (etapa 5) — **8 peças**, todas geradas pelo COMPONENTE e pelo PROMPT do produto, versionadas em `public/conarh/media/` | `scripts/_conarh-*.ts` |
| Cada uma aparece em **card com a CAPA** do PDF. Link de texto sobre tabela desenhada é indistinguível de mock | `porta3/4/5.tsx` |
| **PWA**: service worker + manifest → o tablet abre em MODO AVIÃO. Precache dos ~16 MB que a tela exibe — ~20 MB desde 07/08, com as páginas dos documentos (§0.5). As personas de reserva, 80 MB de vídeo, ficam fora: não são renderizadas | `public/conarh-sw.js` |
| Etapa 4 com **3 pessoas do mesmo cargo, um formato cada** (vídeo · texto · podcast) e rótulos com o primeiro nome — "no contexto DELA" ficava errado em cima do Marcos | `porta4.tsx` |

⚠️ **PII:** os relatórios agregados e os `report_texts` do banco são de clientes reais. Os scripts
filtram `is_demo` **no WHERE**, e recusam rodar sem isso.

⚠️ **`%@vertho.ai` cru apaga as personas de demo** — `gerarRelatorioGestor` saía VAZIO em tenant de
demonstração. Corrigido com `excludeInternalEmails`; **restam 5 sites** com o filtro cru
(pulse ×2, calibração ×2, evolution-report).

⚠️ **Deploy durante a feira invalida os chunks cacheados** — tablet já preparado segue funcionando
(cache-first), mas aparelho novo precisa de rede. **Congelar o deploy em 18-20/08.**

⏳ **Não verificado:** o modo avião foi testado só no dev server (a página abriu pelo fallback, as
mídias falharam — dev não é representativo). O teste que decide é em produção, no iPad, em modo
avião. Instruções enviadas ao sócio em 06/08.

### 0.5 Rodada de 07-08/08/2026 — o documento abre DENTRO da demo

🔴 **O primeiro toque num aparelho real derrubou a etapa 3.** No iPhone, instalado na tela de
início, abrir o PDF **prendia o expositor fora da demo**: os cards usavam `target="_blank"`, e num
PWA standalone o iOS abre a nova aba numa view **sem barra de navegação** — não há botão de voltar.
A única saída era matar o app no multitarefa. Em modo avião seria pior: aquela view é outro
contexto de armazenamento e **não enxerga o cache do service worker**, então o documento nem
abriria.

| Mudou | Onde |
|---|---|
| Os 4 pontos que abriam PDF viraram `<AbrirDocumento>` — overlay com as páginas e um botão **Fechar** grande (a palavra, não só o X) | `_components/documento.tsx` · `porta3/4/5.tsx` |
| As 50 páginas dos 7 documentos são **pré-renderizadas em WebP** (4,4 MB a 1191 px) | `scripts/_conarh-paginas-pdf.ts` |
| O worker precacheia as páginas **lendo o manifesto**, não uma segunda lista à mão (`conarh-v2`) | `public/conarh-sw.js` |
| A contagem de páginas do card passou a ser conferida contra o documento | `tests/unit/conarh-documentos.test.ts` |

**Imagem, e não pdf.js no cliente**, por dois motivos que só aparecem no aparelho: 10 canvas A4 em
DPR 2 são ~180 MB e derrubam a aba do iPhone (o Safari decodifica `<img>` sob demanda e libera
sozinho); e o nome do arquivo é **estável**, então entra no precache — chunk de JS tem hash e só
entraria no cache de runtime, isto é, se alguém já tivesse aberto um PDF antes do modo avião.

⚠️ **4 dos 7 cards declaravam a contagem errada** ("PDF · 7 páginas" num relatório de 9; o DNA
dizia 6 e tem 10). O número era escrito à mão no `conteudo.json` e **nada o lia** — o PDF abria
fora da demo, então ninguém comparava. O visualizador põe os dois números na mesma tela, e o
guard passou a amarrá-los.

⏳ **Segue não verificado:** o modo avião **em produção**. O que o iPhone provou até agora é o
bug de navegação, não o cache.

**Preparar cada tablet** (uma vez, com rede — o cache do web app instalado é separado do Safari):

1. Safari em `https://app.vertho.ai/conarh` — sempre este host, o cache é por origem.
2. Compartilhar → **Adicionar à Tela de Início**.
3. Abrir **pelo ícone**, ainda com rede, e esperar ~1 min parado (≈20 MB de precache).
4. Percorrer as 5 etapas: play no vídeo, no podcast, e abrir um documento.
5. Modo avião → fechar o app no multitarefa → reabrir pelo ícone e percorrer de novo.

## 1. Objetivo da sprint

Colocar de pé, até 17/08, uma operação de estande de 4 m² que **filtra, provoca, demonstra e agenda** — com o app rodando 100% offline no tablet, a captura acontecendo depois do valor, e cada lead classe A saindo com data no calendário.

O que se vende na feira não é feature: é o **anel** — as cinco portas encadeadas, cada uma puxando a vizinha, escritas como problema do visitante, na mesma ordem e com as mesmas palavras em lona, tablet, folder e fala. Mostrar uma porta sozinha coloca a Vertho ao lado de dez concorrentes; mostrar o encadeamento é o que nenhum deles consegue fazer num estande.

## 2. As cinco portas — nomes travados

Estes são os nomes canônicos. Aparecem em **quatro lugares — lona, tablet, folder e fala — sempre na mesma ordem e sem sinônimo**; é essa repetição que permite o gesto de apontar. "Competências, Diagnóstico, PDI, Jornada, Evidência" são as **nossas** palavras e não vão para nenhuma superfície visível ao visitante.

| # | Porta, como ele lê | O que ele está dizendo |
|---|---|---|
| 1 | **Definir o que desenvolver** — matriz e descritores observáveis | "A gente escolhe treinamento por tema da moda, ou porque um gestor pediu." |
| 2 | **Avaliar com consistência** — critério explícito vs. achismo | "Cada gestor avalia do jeito dele. Não tem régua." |
| 3 | **Transformar diagnóstico em PDI** — lacuna → objetivo → missão → evidência | "O PDI é feito e vira documento de gaveta." |
| 4 | **Personalizar o desenvolvimento** — ponto de partida · formato · estilo | "O conteúdo é genérico e ninguém assiste." |
| 5 | **Demonstrar o que evoluiu** — painel do gestor | "Não consigo mostrar pra diretoria o que mudou de verdade." |

Travado no código em `app/conarh/_data/conteudo.json` (`portas[].nome` / `portas[].sub`). Mexer depois da gráfica custa dinheiro. Sobrenome da testeira: **"seu parceiro de desenvolvimento"**.

## 3. Arquitetura — decisões já tomadas (não reabrir)

| Decisão | Consequência |
|---|---|
| Rota separada `/conarh` | Não toca o produto de cliente. Deploy, rollback e congelamento independentes. **Nenhum cron de reset, nenhum overlay de tenant de produção no caminho.** |
| Zero IA ao vivo | Caso canônico fixo; matriz, justificativas, PDIs, espelho e painel pré-computados. Nenhuma chamada de geração no pavilhão — nada pode falhar no meio da frase. |
| Offline-first | Tudo que é prova roda em modo avião. Rede só para operação: captura, envio de artefato, agenda. |
| Estado no cliente + um envio | Um único submit ao final grava a sessão inteira — menos pontos de falha, captura sobrevive a rede ruim. |
| Captura depois do valor | Formulário aparece após a rota, nunca como pedágio. |
| Demo conduzida no tablet | Visitante toca uma única vez — o teste de **40 s** da porta 2. Navegação à prova de expositor cansado: alvos grandes, uma seta óbvia, sem menus. |
| Confronto completo = rota opt-in | Versão de 3 min no celular via QR usa o mesmo caso e o mesmo JSON — **é um modo adicional da mesma rota, não um segundo produto**. |

## 4. Backlog por frente

Prioridades: **P0** sem isso a feira não abre · **P1** é o que diferencia a operação · **P2** entra se sobrar, só depois de P0+P1 congelados. Estado de cada item em §0.

### F1 · Rota `/conarh` — hub das cinco portas
- **P0** Tela-hub com as 5 portas, nomes de §2, mesma ordem da lona/folder/fala.
- **P0** Template de rota: telas curtas, fonte grande (leitura a 60 cm, em pé), botão "próximo" sempre no mesmo lugar, rótulo "caso demonstrativo" visível em toda tela de caso.
- **P0** Trava de navegação: hub em 1 toque de qualquer ponto; reset de sessão entre visitantes.
- **P1** Modo opt-in (QR, 3 min, celular do visitante) com captura mínima no fluxo, gravando **no mesmo pipeline de leads**.
- **Aceite:** porta abre em < 1 s offline, sem login e sem loading visível; rota ≤ 90 s por quem nunca viu a tela; 20 ciclos sem estado residual.

### F2 · Porta 2 — o toque interativo (a única tela com input do visitante)
- ⚠️ **SUPERADO em 04/08 e de novo em 05/08/2026 — ver §0.1 e §0.2.** A sequência abaixo descreve
  o mecanismo do registro escrito, que saiu da tela (continua na prancheta). Hoje: situação →
  as 4 perguntas do cenário respondidas + **classificação do visitante** (o único toque) → matriz
  aberta no descritor testado → a leitura dele × a da régua, resposta a resposta, + "a régua não
  tem viés".
- **P0** ~~Sequência em 5 estados: registro da conversa → nota 1–4 (o único toque) → matriz de descritores revelada → reavaliação do mesmo registro descritor a descritor → leitura do motor lado a lado, com justificativa.~~
- **P0** Registro por sessão — ~~nota instintiva, marcações com critério, divergências vs. motor~~ → ~~nível aceito × meta~~ → hoje `sessao.cenario` (**nível atribuído × nível da régua**, §0.2), com consentimento, anônimo até a captura.
- **P2** Benchmark ao vivo no fecho ("os gestores que passaram por aqui convergem, em média, em X de 5") — só ligar com n ≥ 7 no evento; abaixo disso a linha não aparece.
- **Aceite (vale no mecanismo novo):** nunca "certo/errado" na tela — a linguagem é "a sua leitura" × "a régua"; a matriz sempre antes da leitura; a leitura da régua (trecho, justificativa, nota) **não pode aparecer na tela em que ele ainda vai classificar**. Quem lê igual à régua ouve **"mesma leitura — e é o que acontece com quem já tem uma régua na cabeça"**: o visitante que converge não pode virar silêncio constrangido. Quem lê acima ou abaixo ouve generosidade/exigência, nunca erro.

### F3 · Conteúdo das cinco rotas — pacote offline
- **P0** Caso canônico (feedback, delegação ou conversa difícil) com contexto da personagem, registro, **matriz de 5–6 descritores** e justificativas do motor — **ambíguo o bastante para um bom gestor divergir, defensável o bastante para ele aceitar**. Validado com 3 clientes/prospects em ligação: se os três não reconhecerem a dor, **troca o caso — não a palavra**. **Caminho crítico da sprint.**
- **P0** Porta 1: matriz aberta com definições operacionais dos descritores · Porta 3: PDI da personagem (lacuna → objetivo → missão prática → evidência esperada) · Porta 5: painel do gestor navegável (pessoas × descritores × antes/depois, com status **evolução confirmada / parcial / estagnação**), rotulado "demo".
- **P0** Porta 4 — o espelho: duas pessoas, mesmo cargo, competência e semana. **O que permanece** (competência, descritor, ideia central) × **o que muda** (exemplo, linguagem, desafio, formato). Conferida **abrindo como colaborador nas duas personas** — tela vazia aqui é o maior risco visual da demo.
- **P0** 4–5 personas com kit completo exportado para play local: perfil · pílula 1 · pílula 2 · missão prática · áudio · vídeo. Nenhum arquivo toca a rede ao dar play.
- **P1** Recorte do caso real (rede com 36 pessoas) — só entra com autorização/anonimização documentada; sem ela, fica de fora sem drama.
- **P1** 2 casos-reserva no mesmo JSON-schema. Troca de caso = troca de JSON, sem deploy.
- **Aceite:** verificação por presença (nome e valor na tela), nunca por relatório de geração. Cada rota ≤ 90 s.

### F4 · Captura e qualificação
- **P0** Formulário pós-valor: nome · empresa · cargo · e-mail corporativo · WhatsApp · porta escolhida · competência crítica (palavras dele) · horizonte (**rodando / até 3 m / 3–6 m / sem data**) · aceite LGPD explícito com finalidade declarada e canal de exclusão. Porta e competência pré-preenchidas pela sessão — o expositor só confirma. Envio único ao final.
- **P0** Origem em campo próprio (`conarh-2026`), nunca concatenada em texto livre. Relatório de leads filtrável por origem desde o dia 1.
- **P1** Classificação A/B/C na hora (§6) com alerta ao fechador para lead A, em < 30 s, **com nome, porta e competência**.
- **P1** Fila do dia no tablet (somente-leitura: nome · empresa · porta · competência · horizonte · hora), para retomar conversa em 2 segundos. Funciona com sync atrasado — a fila local já basta para operar.
- **Aceite:** a classe é calculada **no servidor** — o formulário roda no navegador do visitante, e o funil não pode depender de flag escolhida por quem preenche.

### F5 · Entrega de artefatos
- **P0** Recorte da rota por WhatsApp **+** e-mail, em fila assíncrona, com mensagem honesta ("chega em alguns minutos") — nunca "na hora", nunca canal único. Rede caiu → entra na fila e sai quando volta; perde-se o artefato, não a experiência.
- **P0** Decisão do canal de WhatsApp na semana 1 (API oficial × aquecimento de número).
- **P1** Mapa da Evolução por rota (1 página: problema declarado + exemplo visto + ciclo completo + 3 perguntas para revisar o processo atual da empresa), com nome da pessoa e marca.
- **Aceite:** sobrevive a um print encaminhado ao chefe — porta, marca e próximo passo legíveis na captura de tela.

### F6 · Agenda na hora
- ⚠️ **REVERTIDO em 04/08/2026 — ver §0.1.** O seletor de slots saiu do tablet e o botão "marcar
  os 20 minutos" saiu do fecho: marcar reunião voltou a ser conversa, e o horário é combinado
  pelo fechador no WhatsApp. `diag_leads.reuniao_em` continua no schema e a confirmação por
  mensagem continua funcionando se a data chegar por outro canal.
- **P1** ~~Botão "marcar os 20 minutos" no fecho: grade de slots dos 3 dias, confirmação imediata no WhatsApp do visitante + convite de calendário.~~ Fallback: link de agendamento manual.
- **Aceite (revisado):** lead A sai do estande com o próximo passo aceito e registrado — a data entra na conversa do fechador.

### F7 · Telemetria, painel diário e ativo de dados
- **P0** Eventos por sessão: porta escolhida · rota iniciada/concluída · ⚠️ ~~nota instintiva · reavaliação · divergências~~ → ~~nível aceito × meta~~ → **nível atribuído × nível da régua** (§0.2) · captura concluída · classe do lead · reunião marcada.
- **P1** Painel diário de 5 números (rotas concluídas · leads A · leads B · reuniões com data · total de capturas), lido em 5 min às 18h — uma variável por dia. O **comparativo de ganchos verbais é contador manual**, ao lado do painel: o app não tem como observá-lo.
- **P1** Dataset do evento para o ativo de setembro ("como um critério explícito muda a avaliação do gestor"), por porta, cargo e porte — campos anônimos, consentimento registrado, nenhum recorte publicável com n < 7.
- **Aceite:** funil reconstruível por dia e por porta, exportável para a reunião de 5 min do fim do dia.
- ⚠️ **Limite declarado:** a demo roda em modo avião, então nada é emitido *durante* a rota — a sessão acumula no dispositivo e vira evento no único submit da captura. Logo **"rotas concluídas" conta quem capturou**, não quem passou. O denominador do funil é capturas, não visitantes; quem viu a rota e não deixou contato não aparece. Contar de outro jeito exigiria um endpoint público de escrita anônima, que não se paga.

### F8 · Régua de follow-up
- **P1** Cadência agendada antes da feira: **T+0** mensagem humana ao lead A citando a porta e confirmando a reunião · **T+1** recorte aplicado à competência citada, zero pedido · **T+3** fila de ligação para os A · **T+5** insight agregado do evento.
- **Aceite:** nenhum "passando pra saber se viu meu e-mail" — todo toque entrega evidência, ferramenta ou decisão, ou não é enviado. B e C só entram se responderem.

### F9 · Degustação (o que a feira vende)
- **P0** Tenant de degustação validado por presença: subdomínio próprio **por empresa**, **modo personalizado**, 3–5 pessoas, sem cron de reset ativo. Aberto **como colaborador, não como admin** — o que a equipe vê na feira é o que o cliente verá na semana seguinte.
- **P0** Capacidade real calculada antes de qualquer escassez anunciada — **geração + curadoria por semana**, com número registrado pelos sócios. Sem esse número, a palavra "vagas" não é usada: escassez inventada queima mais do que converte.

### F10 · Infraestrutura de feira
- **P0** Pacote em 2 tablets idênticos (11–13", brilho alto, capa com alça) + prancheta plastificada com o caso como fallback de zero tecnologia.
- **P0** Sync por roteador 4G próprio, 2 chips de operadoras diferentes, **+ Wi-Fi portátil de backup** — nunca o Wi-Fi do pavilhão.
- **P0** 2 power banks, carregadores, extensão, rotina de carga definida (quem carrega o quê, quando).
- **Aceite:** teste integral em modo avião nos dois dispositivos, com folga, em T-1. Lead capturado às 9h na base até 9h05 mesmo com uma operadora fora. Dia 1 inteiro sem tomada, se necessário.

## 5. Frentes comerciais/paralelas (fora do app, dentro da sprint)

| Prazo | Entrega | Quem |
|---|---|---|
| Agora | Manual do expositor: altura útil da lona · se é retroiluminada · se dá para trocar a mesa baixa por bancada alta · leitor de crachá · tomada no módulo · **se pode abordar no corredor**. Nada contratado antes disso. | Juliane |
| Agora | Travar os nomes das 5 portas (§2) + sobrenome da testeira. Depois disso, mexer custa gráfica. | Sócios |
| Semana 1 | Teste da headline com 12–20 contatos reais de RH: 3 s de cada versão, A × B, decidido por **intenção de parar**, não por gosto. Se o prazo da gráfica não permitir: teste verbal no dia 1 com contador, e a vencedora vira a sublinha em velcro no dia 2. | Comercial |
| Semana 2 | Arte da lona, folder A5 (**frente:** marca + sobrenome + headline · **verso:** as 5 portas como problema + QR de agendamento), cartão de bolso e camiseta — fechados e enviados. **Nunca QR solto na parede.** | Juliane |
| Semana 2 | Tablets, power banks, roteador 4G com 2 chips. | Samuel |
| Semana 3 | **Meta mínima de reuniões em 30 dias registrada** — a métrica-mãe precisa de alvo antes da feira, não depois. | Comercial |
| Semana 3 | Ensaio cronometrado das 5 rotas com quem nunca ouviu falar da Vertho (rota ≤ 90 s, abordagem ≤ 3 min). O que estoura, corta. | Todos |
| T-1 | Montagem, teste integral na rede do pavilhão, **confirmação dos slots pré-agendados dia a dia**, briefing de metas e papéis. | Todos |

## 6. Classificação de leads e cadência

Sem esta tabela na mão do expositor, o alerta de lead A não tem critério e a régua de follow-up dispara para quem não deveria.

| Classe | Definição | Tratamento |
|---|---|---|
| **A** | Dentro do perfil · dor clara · horizonte quente (rodando / até 3 m) · aceitou o próximo passo ⚠️ *(04/08: "decide ou recomenda" saiu do predicado — §0.1)* | Próximo passo aceito e registrado; o fechador marca a data. Recorte no WhatsApp no mesmo dia. |
| **B** | Boa aderência e dor clara, sem urgência | Mapa da Evolução + convite específico. |
| **C** | Curioso, fornecedor, fora do perfil | Material se pedir. **Fora da cadência ativa** — é o que mantém alta a taxa de resposta de A e B. |

| Quando | O quê |
|---|---|
| **T+0** | Mensagem humana ao lead A citando a porta que ele apontou e confirmando a reunião. |
| **T+1** | Um recorte aplicado à competência que ele citou. Zero pedido. |
| **T+3** | Ligação proativa para os A. Para B e C, só quem respondeu. |
| **T+5** | Insight agregado do evento — alimenta o ativo de dados de setembro. |

**Os predicados de A são avaliados em código** (`lib/conarh/classificacao.ts`, coberto por
`tests/unit/conarh-classificacao.test.ts`). Desde 04/08/2026 **nenhum depende de marcação do
expositor além do toggle "aceitou um próximo passo"**: *decide ou recomenda* e *fora do perfil*
saíram da tela, e o predicado de A foi reajustado no mesmo commit — senão A viraria inalcançável
e o alerta morreria calado (§0.1). Consequência assumida: **C só acontece pela regra automática**
(sem dor e sem decisor declarado); curioso e fornecedor entram como B. Se isso poluir a cadência
na feira, o caminho é devolver o toggle *fora do perfil* — não afrouxar a régua.

## 7. Cronograma — três semanas, quatro gates

⚠️ A janela são **19 dias corridos**, e a semana 1 tem **3 dias úteis** (qua 29, qui 30, sex 31/07). A validação do caso com 3 clientes é o item que menos depende de nós e o que mais trava o resto — começa hoje.

| Semana | Entregas | Gate de saída |
|---|---|---|
| **1 · 29/07–02/08** — conteúdo e decisões | Caso canônico escrito + validado com 3 clientes (Rodrigo) · nomes das portas travados (§2) · schema JSON fechado · canal de WhatsApp decidido · capacidade de degustação calculada · autorização do caso real solicitada | **Caso validado pelos 3 reconhecendo a dor.** Sem isso, troca o tema na semana 1 — nunca na 2. |
| **2 · 03/08–09/08** — conferência e conteúdo real | Verificação por presença das 5 rotas · espelho conferido como colaborador nas duas personas · play local dos kits nos 2 tablets · teste ponta a ponta da captura em rede móvel e modo avião · QR do modo opt-in · envs de produção conferidas (§9.8) | **Teste ponta a ponta com 10 pessoas reais**, em rede móvel e modo avião, por quem não conhece a Vertho: entendem o que viram sem explicação. |
| **3 · 10/08–16/08** — operação | Teste de volume no canal de mensagens · exportação para os 2 tablets · prancheta impressa · régua T+0→T+5 conferida em produção · meta de reuniões registrada · 30 ensaios cronometrados · **congelamento de conteúdo em 14/08** | **Congelado e ensaiado:** nenhuma feature nova depois de 14/08; só corte e ensaio. |
| **T-1 · 17/08** — montagem | Montagem no local · teste integral na rede do pavilhão (prova de que nada essencial a usa) · sync 4G validado · slots pré-agendados confirmados · briefing de metas e papéis | **Nenhum ponto crítico depende de rede.** Aceite binário, assinado pelos três sócios. |

**O congelamento em 14/08 encurta a semana 3 para 5 dias úteis** (10–14/08) para qualquer coisa que seja feature. De 15 a 16/08 só entram corte e ensaio.

## 8. Papéis

- **Rodrigo** — casos (canônico + reservas), validação com clientes, autorização do caso real.
- **Tech** — engenharia da rota `/conarh`, pacote offline, captura, telemetria.
- **Comercial** — canal de mensagens, agenda, régua de follow-up, teste de headline, meta de reuniões.
- **Samuel** — equipamentos e infraestrutura física.
- **Juliane** — manual do expositor, arte e gráfica.
- **No estande** — Anfitrião (faz parar, filtra, controla a fila) × Especialista (executa a rota, qualifica, agenda), rodízio a cada 2 h, sempre em pé.

## 9. Verificações obrigatórias (item "pronto" que não está pronto é pior que pendente)

1. **Rate limit da captura** — ✅ **verificado (29/07).** Teto de **300 capturas/h por IP** e **5/h por identidade** (`actions/lead-comercial.ts`). O estande inteiro sai por um roteador, mas 300/h num estande de 4 m² é inatingível, e o teto foi dimensionado exatamente para o caso de evento com IP compartilhado. A mensagem de limite é **única** para qualquer motivo, de propósito: distinguir "muitos desta rede" de "já recebemos seu contato" é enumeração de cadastro num formulário público.
2. **Verificação por presença** em todo conteúdo — nome e valor na tela, **abrindo como colaborador**: matriz, PDI, espelho, kits, painel. Relatório de geração não é evidência.
3. **Reset entre sessões** — 20 ciclos seguidos sem estado residual do visitante anterior.
4. **Play local de verdade** — modo avião ligado e dar play em cada vídeo, áudio e PDF de cada persona, **nos 2 tablets**.
5. **Canal de mensagens sob volume** — centenas de envios em janela curta na semana 3, com e-mail + link na tela em paralelo desde o dia 1. Se o número cair, a experiência já aconteceu na tela.
6. **LGPD** — aceite explícito, finalidade declarada, canal de exclusão, expurgo simples pós-evento (sem "política de retenção" para dado de feira). Caso real de cliente só com autorização documentada.
7. **Fallback ensaiado** — a prancheta plastificada não é enfeite: um ensaio inteiro só com ela.
8. **Envs de produção configuradas** — `CONARH_ALERT_WHATSAPP` (alerta de lead A e resumos da régua; ausente = alerta some com um warn no log) e `CONARH_PANEL_KEY` (painel e fila; ausente = 503 em produção). Conferir **antes** do dia 1: sem elas o funil parece funcionar e o fechador nunca é avisado.

## 10. Premissas não verificadas (e como fechar)

- **"Seu treinamento mudou o quê?" faz alguém parar** — premissa herdada, não medida → teste da headline na semana 1.
- **O gestor de RH quer resolver a lacuna de evidência** — se cair (gestor comprando treinamento como item de checklist), o posicionamento alternativo é "reduzir o esforço operacional do RH": PDI e desenvolvimento no WhatsApp sem sobrecarregar o time.
- **O visitante concede 2–3 min de atenção estruturada** → contador do dia 1 + fallback de 45 s (filtro + provocação afiada, toda a prova no follow-up).

## 11. Definição de pronto

As cinco etapas abrem em modo avião · a etapa 2 registra o nível aceito no cenário (nas TRÊS réguas) · a captura grava origem, etapa e competência · o recorte sai por dois canais · o ensaio fecha rota ≤ 90 s · o tablet 2 está idêntico ao 1.

**O que não estiver assim em 17/08 não vai para a feira — corta-se, não se remenda.**

---

*Deriva de `Vertho-CONARH-52-Proposta-Resumida.pdf` e `Vertho-CONARH-52-Sprint-do-App.pdf` (29/07/2026), reconciliado com o código em 29/07/2026. Conteúdo do pacote offline e proveniência dos assets: `docs/CONARH52-CONTEUDO.md`. A operação de fala permanece na Proposta Resumida.*
