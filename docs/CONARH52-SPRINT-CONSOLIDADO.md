# CONARH 52 — Proposta de Sprint Consolidada (Operação + App)

Consolida a **Proposta Resumida de Operação** e o **Sprint do App** (ambos emitidos em 29/07/2026) num único plano executável. Um documento por semana, um gate por semana, um dono por frente.

- **Janela:** 29/07 → 17/08/2026 (3 semanas) · feira 18–20/08
- **Métrica-mãe:** reuniões realizadas em 30 dias (não "quantos pararam")
- **Premissa-mãe:** a rota `/conarh` não existe no produto hoje — é entrega a construir
- **Aceite final:** nenhum ponto crítico depende de rede
- **Regra que rege:** a demo existe a serviço do agendamento. Qualificou, corta e marca.

---

## 1. Objetivo da sprint

Colocar de pé, até 17/08, uma operação de estande de 4 m² que **filtra, provoca, demonstra e agenda** — com o app rodando 100% offline no tablet, a captura acontecendo depois do valor, e cada lead classe A saindo com data no calendário.

O que se vende na feira não é feature: é o **anel** — as cinco portas encadeadas (matriz → avaliação com régua → PDI → personalização → evidência), escritas como problema do visitante, na mesma ordem e com as mesmas palavras em lona, tablet, folder e fala.

## 2. Arquitetura — decisões já tomadas (não reabrir)

| Decisão | Consequência |
|---|---|
| Rota separada `/conarh` | Não toca o produto de cliente. Deploy, rollback e congelamento independentes. |
| Zero IA ao vivo | Caso canônico fixo; matriz, justificativas, PDIs, espelho e painel pré-computados. |
| Offline-first | Tudo que é prova roda em modo avião. Rede só para captura, envio de artefato e agenda. |
| Estado no cliente + um envio | Um único submit ao final grava a sessão inteira — captura sobrevive a rede ruim. |
| Captura depois do valor | Formulário aparece após a rota, nunca como pedágio. |
| Demo conduzida no tablet | Visitante toca uma única vez (porta 2). Navegação à prova de expositor cansado. |
| Confronto completo = rota opt-in | Versão de 3 min no celular via QR usa o mesmo caso e o mesmo JSON. |

## 3. Backlog por frente

Prioridades: **P0** sem isso a feira não abre · **P1** é o que diferencia a operação · **P2** entra se sobrar, só depois de P0+P1 congelados.

### F1 · Rota `/conarh` — hub das cinco portas
- **P0** Tela-hub com as 5 portas, nomes travados, mesma ordem da lona/folder/fala.
- **P0** Template de rota: telas curtas, fonte grande (leitura a 60 cm), botão "próximo" fixo, rótulo "caso demonstrativo" em toda tela.
- **P0** Trava de navegação: hub em 1 toque de qualquer ponto; reset de sessão entre visitantes.
- **P1** Modo opt-in (QR, 3 min, celular do visitante) com captura mínima no fluxo.
- **Aceite:** porta abre em < 1 s offline; rota ≤ 90 s por quem nunca viu a tela; 20 ciclos sem estado residual.

### F2 · Porta 2 — o toque interativo
- **P0** Sequência em 5 estados: registro da conversa → nota 1–4 (o único toque) → matriz revelada → reavaliação descritor a descritor → leitura do motor lado a lado.
- **P0** Registro por sessão: nota instintiva, marcações com critério, divergências vs. motor — com consentimento, anônimo até a captura.
- **P2** Benchmark ao vivo no fecho (só com n ≥ 7 no evento).
- **Aceite:** nunca "certo/errado" — só "convergiram/divergiram"; matriz sempre antes da reavaliação.

### F3 · Conteúdo das cinco rotas — pacote offline
- **P0** Caso canônico (feedback, delegação ou conversa difícil) validado com 3 clientes/prospects — **caminho crítico da sprint**.
- **P0** Porta 1: matriz com descritores observáveis · Porta 3: PDI (lacuna → objetivo → missão → evidência) · Porta 5: painel do gestor navegável, rotulado "demo".
- **P0** Porta 4 — o espelho: duas pessoas, mesmo cargo/competência/semana; conferida **abrindo como colaborador** (maior risco visual da demo).
- **P0** 4–5 personas com kit completo (perfil, pílulas, missão, áudio, vídeo) exportado para play local.
- **P1** Recorte do caso real (rede com 36 pessoas) — só com autorização/anonimização documentada.
- **P1** 2 casos-reserva no mesmo JSON-schema (troca de caso = troca de JSON, sem deploy).
- **Aceite:** verificação por presença (nome e valor na tela), nunca por relatório de geração.

### F4 · Captura e qualificação
- **P0** Formulário pós-valor: nome · empresa · cargo · e-mail corporativo · WhatsApp · porta escolhida · competência crítica (palavras dele) · horizonte · LGPD explícito. Porta e competência pré-preenchidas pela sessão.
- **P0** Origem em campo próprio (`conarh-2026`), nunca concatenada em texto livre.
- **P1** Classificação A/B/C na hora, com alerta < 30 s ao fechador para lead A.
- **P1** Fila do dia no tablet (somente-leitura), funciona com sync atrasado.

### F5 · Entrega de artefatos
- **P0** Recorte da rota por WhatsApp + e-mail, em fila assíncrona, mensagem honesta ("chega em alguns minutos"). Rede caiu → entra na fila; perde-se o artefato, não a experiência.
- **P0** Decisão do canal de WhatsApp na semana 1 (API oficial × aquecimento de número).
- **P1** Mapa da Evolução por rota (1 página: problema declarado + exemplo visto + ciclo completo + 3 perguntas), legível num print encaminhado ao chefe.

### F6 · Agenda na hora
- **P1** Botão "marcar os 20 minutos" no fecho: grade de slots dos 3 dias, confirmação no WhatsApp + convite de calendário. Fallback: link manual.
- **Aceite:** lead A sai com data no calendário — não com "a gente se fala".

### F7 · Telemetria, painel diário e ativo de dados
- **P0** Eventos por sessão: porta · rota iniciada/concluída · notas · divergências · captura · classe · reunião marcada.
- **P1** Painel diário de 5 números (rotas concluídas · leads A · leads B · reuniões com data · comparativo de ganchos verbais) — uma tela, lida em 5 min às 18h, uma variável por dia.
- **P1** Dataset do evento para o ativo de setembro ("como um critério explícito muda a avaliação do gestor"), anônimo, nenhum recorte publicável com n < 7.

### F8 · Régua de follow-up
- **P1** Cadência agendada antes da feira: **T+0** mensagem humana ao lead A citando a porta · **T+1** recorte aplicado à competência citada, zero pedido · **T+3** ligação proativa para A · **T+5** insight agregado do evento.
- **Aceite:** nenhum "passando pra saber se viu meu e-mail" — todo toque entrega evidência, ferramenta ou decisão. B e C só entram se responderem.

### F9 · Degustação (o que a feira vende)
- **P0** Tenant de degustação validado por presença (subdomínio próprio, 3–5 pessoas, sem cron de reset), aberto como colaborador.
- **P0** Capacidade real calculada antes de qualquer escassez anunciada. Sem número registrado pelos sócios, a palavra "vagas" não é usada.

### F10 · Infraestrutura de feira
- **P0** Pacote em 2 tablets idênticos (11–13", brilho alto, capa com alça) + prancheta plastificada com o caso como fallback de zero tecnologia.
- **P0** Sync por roteador 4G próprio, 2 chips de operadoras diferentes — nunca o Wi-Fi do pavilhão. Lead das 9h na base até 9h05 com uma operadora fora.
- **P0** 2 power banks, carregadores, extensão, rotina de carga definida. Dia 1 inteiro sem tomada, se necessário.

## 4. Frentes comerciais/paralelas (fora do app, dentro da sprint)

| Prazo | Entrega | Quem |
|---|---|---|
| Agora | Manual do expositor (altura da lona, retroiluminação, bancada, leitor de crachá, tomada, corredor). Nada contratado antes disso. | Juliane |
| Agora | Travar nomes das 5 portas + sobrenome da testeira. Depois disso, mexer custa gráfica. | Sócios |
| Semana 1 | Teste da headline com 12–20 contatos reais de RH (A × B, intenção de parar). | Comercial |
| Semana 2 | Arte da lona, folder A5, cartão de bolso e camiseta — fechados e enviados. | Juliane |
| Semana 2 | Tablets, power banks, roteador 4G com 2 chips. | Samuel |
| Semana 3 | Ensaio cronometrado das 5 rotas com quem nunca ouviu falar da Vertho (rota ≤ 90 s, abordagem ≤ 3 min). | Todos |
| T-1 | Montagem, teste integral na rede do pavilhão, briefing de metas e papéis. | Todos |

## 5. Cronograma — três semanas, quatro gates

| Semana | Entregas | Gate de saída |
|---|---|---|
| **1 · 29/07–02/08** — conteúdo e decisões | Caso canônico escrito + validado com 3 clientes (Rodrigo) · nomes das portas travados · schema JSON fechado · canal de WhatsApp decidido · rate limit da captura verificado · capacidade de degustação calculada · autorização do caso real solicitada | **Caso validado pelos 3 reconhecendo a dor.** Sem isso, troca o tema na semana 1 — nunca na 2. |
| **2 · 03/08–09/08** — construção | `/conarh` no ar (hub + template + navegação travada) · porta 2 interativa completa · rotas 1/3/4/5 com conteúdo real · espelho conferido como colaborador · kits exportados · captura pós-valor + origem + LGPD · envio de recorte (1 canal já basta) · 2 casos-reserva no schema | **Teste ponta a ponta com 10 pessoas reais**, em rede móvel e modo avião, por quem não conhece a Vertho: entendem o que viram sem explicação. |
| **3 · 10/08–16/08** — operação | Mapa da Evolução · agenda in-app · A/B/C + alerta · fila do dia · régua T+0→T+5 agendada · painel diário · teste de volume no canal · exportação para os 2 tablets · prancheta impressa · **congelamento de conteúdo em 14/08** · 30 ensaios cronometrados | **Congelado e ensaiado:** nenhuma feature nova depois de 14/08; só corte e ensaio. |
| **T-1 · 17/08** — montagem | Montagem no local · teste integral na rede do pavilhão (prova de que nada essencial a usa) · sync 4G validado · briefing de metas e papéis | **Nenhum ponto crítico depende de rede.** Aceite binário, assinado pelos três sócios. |

## 6. Papéis

- **Rodrigo** — casos (canônico + reservas), validação com clientes, autorização do caso real.
- **Tech** — engenharia da rota `/conarh`, pacote offline, captura, telemetria.
- **Comercial** — canal de mensagens, agenda, régua de follow-up, teste de headline.
- **Samuel** — equipamentos e infraestrutura física.
- **Juliane** — manual do expositor, arte e gráfica.
- **No estande** — Anfitrião (faz parar, filtra, controla a fila) × Especialista (executa a rota, qualifica, agenda), rodízio a cada 2 h, sempre em pé.

## 7. Verificações obrigatórias (item "pronto" que não está pronto é pior que pendente)

1. **Rate limit da captura** — validar por rota e por domínio. O estande sai por um roteador: se o limite for por IP, a captura morre na manhã do dia 1 com o painel mostrando zero.
2. **Verificação por presença** em todo conteúdo — abrir como colaborador, nunca pelo relatório de geração.
3. **Reset entre sessões** — 20 ciclos sem estado residual.
4. **Play local de verdade** — modo avião + play em cada vídeo/áudio/PDF de cada persona, nos 2 tablets.
5. **Canal de mensagens sob volume** — centenas de envios em janela curta na semana 3; e-mail + link na tela em paralelo desde o dia 1.
6. **LGPD** — aceite explícito, finalidade declarada, canal de exclusão, expurgo simples pós-evento. Caso real só com autorização documentada.
7. **Fallback ensaiado** — um ensaio inteiro só com a prancheta plastificada.

## 8. Premissas não verificadas (e como fechar)

- **"Seu treinamento mudou o quê?" faz alguém parar** — premissa herdada, não medida → teste da headline na semana 1.
- **O gestor de RH quer resolver a lacuna de evidência** — se cair, o posicionamento alternativo é "reduzir o esforço operacional do RH" (PDI e desenvolvimento no WhatsApp sem sobrecarregar o time).
- **O visitante concede 2–3 min de atenção** → contador do dia 1 + fallback de 45 s (filtro + provocação, prova no follow-up).

## 9. Definição de pronto

As cinco portas abrem em modo avião · a porta 2 registra nota, reavaliação e divergências · a captura grava origem, porta e competência · o recorte sai por dois canais · o ensaio fecha rota ≤ 90 s · o tablet 2 está idêntico ao 1.

**O que não estiver assim em 17/08 não vai para a feira — corta-se, não se remenda.**

---

*Fontes: Vertho-CONARH-52-Proposta-Resumida.pdf e Vertho-CONARH-52-Sprint-do-App.pdf (29/07/2026).*
