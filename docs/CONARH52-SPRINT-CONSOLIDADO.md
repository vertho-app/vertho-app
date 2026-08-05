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
| F2 porta 2 interativa — **cenário + 4 respostas** desde 04/08 (§0.1) | ✅ | `porta2.tsx` · `_components/reguas.ts` |
| F2 · três réguas trocáveis nas etapas **1 e 2** (Liderança · Vendas · Transversal) | ✅ 04-05/08 | `seletor-regua.tsx` · `reguas.ts` · `conteudo.json` |
| F2 · fluxo da etapa 2 verificado no navegador (headless) | ✅ 05/08 — 9/9 asserções, 0 erro de console | receita na memória `reference_verificacao_navegador` |
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
| **Etapa 2** | registro escrito → **cenário situacional + 4 respostas** | O registro fazia a demo parecer depender de um gestor com boa memória escrevendo um relatório bom. Agora roda o artefato real: 4 respostas plausíveis, embaralhadas, e a régua as separa. |
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
   do painel: `conarh:cache-painel-v2` → `v3`.

**A prancheta (`/conarh/prancheta`) continua no fluxo do registro escrito** — é papel, não tem
toque nem estado. Por isso o bloco `porta2` do `conteudo.json` (registro + leitura do motor)
segue vivo: apagá-lo deixa o plano B da feira em branco. ⏳ Pendente decidir se o papel espelha
o cenário.

Guardas de conteúdo e de texto (falham no CI, validadas por mutação):
`tests/unit/conarh-conteudo.test.ts` (toda régua com cenário, 4 respostas uma por nível, ordem
não-crescente, descritor testado existindo na matriz) e `tests/unit/conarh-mensagens.test.ts`
(o follow-up não pode dizer "porta" nem "quem decide", nem colar o nome da empresa depois de
artigo fixo).

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
- ⚠️ **SUPERADO em 04/08/2026 — ver §0.1.** A sequência abaixo descreve o mecanismo do registro
  escrito, que saiu da tela (continua na prancheta). Hoje: situação → 4 respostas embaralhadas
  (o único toque) → matriz aberta no descritor testado → leitura da escolha + as quatro por nível.
- **P0** ~~Sequência em 5 estados: registro da conversa → nota 1–4 (o único toque) → matriz de descritores revelada → reavaliação do mesmo registro descritor a descritor → leitura do motor lado a lado, com justificativa.~~
- **P0** Registro por sessão — ~~nota instintiva, marcações com critério, divergências vs. motor~~ → hoje `sessao.cenario` (nível aceito × meta), com consentimento, anônimo até a captura.
- **P2** Benchmark ao vivo no fecho ("os gestores que passaram por aqui convergem, em média, em X de 5") — só ligar com n ≥ 7 no evento; abaixo disso a linha não aparece.
- **Aceite (vale no mecanismo novo):** nunca "certo/errado" na tela — a linguagem é "o seu padrão" × "a régua"; a matriz sempre antes da leitura. Se ele escolhe N3 ou N4, a tela diz **"o seu padrão já está na meta da régua"**: o visitante que acerta não pode virar silêncio constrangido.

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
- **P0** Eventos por sessão: porta escolhida · rota iniciada/concluída · ⚠️ ~~nota instintiva · reavaliação · divergências~~ → **nível aceito no cenário × meta** (§0.1) · captura concluída · classe do lead · reunião marcada.
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
