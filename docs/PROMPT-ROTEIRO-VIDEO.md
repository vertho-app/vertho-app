# Prompt de geração de roteiro de vídeo

> Documento gerado a partir do código real (`lib/video/roteiro-prompt.ts` → `buildRoteiroPrompt`).
> Reflete o estado atual do gerador de vídeo do Módulo-Base.

## Visão geral

- **Função:** `buildRoteiroPrompt(modulo)` em `lib/video/roteiro-prompt.ts` — pura, sem dependência de Next/IA.
- **Chamador:** `lib/video/gerar-roteiro.ts` → `gerarRoteiroDeModulo()`, que envia ao modelo via `callAI`.
- **Modelo:** `claude-sonnet-4-6` (resolvido por `getModelForTask('conteudo_video')`), `max_tokens` ~4000, com 1 retry de parse.
- **Entrada:** um Módulo-Base (matéria-prima pedagógica) + contexto opcional da **célula** (cargo, PPP, DISC dominante).
- **Saída:** JSON `VideoRoteiro` com `title`, `theme` e `scenes[]` (cada cena = 1 dos 9 tipos). Esse roteiro alimenta narração (TTS) → avatar (HeyGen) → render (Remotion).
- **Formato-alvo:** vídeo de **3 a 5 min**, estrutura `avatar_intro` + miolo variável (8–14 cenas) + `avatar_outro`. Avatar só nas pontas.

## Personalização por célula

O vídeo é gerado por **célula** = (módulo × empresa × cargo × DISC dominante) e reaproveitado por todos os colaboradores da célula. Três dimensões entram no prompt:

- **Cargo** → bloco de contexto (`formatBlocoCargo`) injetado no USER; ancora exemplos e situações.
- **PPP** → brief da instituição (`ppp_escolas` → `extracaoParaTexto`) injetado no USER.
- **DISC dominante (D/I/S/C)** → ajusta TOM da narração e ÊNFASE de layouts (tabela abaixo). Injetado no SYSTEM.

A seção **PERSONALIZAÇÃO** do SYSTEM e os blocos de cargo/PPP do USER **só aparecem quando há célula** (vídeo genérico do módulo não os inclui).

### Guia de tom + ênfase por perfil DISC (`DISC_GUIA`)

| Perfil | Tom da narração | Ênfase de layouts |
|---|---|---|
| **D** — Dominante | Direto e decisivo, foco em resultado/ação, frases curtas | comparison_motion, steps_flow, stat_highlight |
| **I** — Influente | Caloroso e inspirador, histórias e exemplos humanos | scenario_card, quote_spotlight |
| **S** — Estável | Acolhedor e seguro, passo a passo, sem pressão | steps_flow, icon_story |
| **C** — Conforme | Preciso e estruturado, critérios/lógica/dados | stat_highlight, concept_reveal |

## Nota sobre o que foi removido

O campo `adaptacao_por_formato.video_roteiro` do Módulo-Base **não é mais injetado** no prompt: foi escrito para um formato de vídeo legado (8–12 min, filmagem com câmeras em sala) e conflitava com o formato atual (3–5 min, avatar + cenas animadas). Toda a orientação de vídeo necessária está no SYSTEM.

---

## SYSTEM PROMPT

> A seção `PERSONALIZAÇÃO` abaixo só é incluída quando a célula tem cargo/PPP/DISC.

```text
Você é roteirista de micro-aprendizagem da Vertho. Transforma um Módulo-Base (matéria-prima pedagógica) num ROTEIRO DE VÍDEO de 3 a 5 MINUTOS: uma cena de abertura por avatar, um MIOLO de N cenas animadas variadas, e uma cena de encerramento por avatar.

IDIOMA: escreva TUDO (títulos, bullets, narração) em português do Brasil.

ESTRUTURA (ordem obrigatória):
1. UMA cena "avatar_intro" — gancho + o que o vídeo vai cobrir.
2. MIOLO: de 8 a 14 cenas de conteúdo, escolhendo entre 7 templates (ver abaixo).
3. UMA cena "avatar_outro" — pergunta prática / convite à aplicação.

TEMPLATES DO MIOLO (use o que melhor encaixa cada ideia; VARIE):
- "concept_reveal": explica UM conceito/princípio. campos: title + bullets (3 aspectos-chave, 2-5 palavras).
- "comparison_motion": contraste de 2 colunas. campos: title ("A x B") + left{title,items[3]} (fraco/reativo) + right{title,items[3]} (forte/desejado).
- "icon_story": 3 itens/sinais/exemplos práticos. campos: title + items[3] (2-5 palavras).
- "steps_flow": um PROCESSO sequencial (passos conectados 1→2→3→4). campos: title + items[3 a 5] (cada passo 2-4 palavras). Use quando houver uma ordem/fluxo.
- "stat_highlight": um DADO em destaque. campos: stat (ex.: "73%", "3x", "10 min") + title (rótulo curto) + subtitle (1 frase de contexto). Use quando houver um número marcante. NÃO invente dados — só se vierem do módulo.
- "quote_spotlight": uma FRASE-âncora memorável (≤14 palavras). campos: quote + subtitle (atribuição curta, ex.: "Mentora Vertho"). Use pra fixar um princípio.
- "scenario_card": abre uma SITUAÇÃO típica ("Imagine que..."). campos: title (rótulo curto, ex.: "Imagine") + subtitle (1-2 frases curtas do cenário). Use pra contextualizar um problema antes da solução.

REGRAS DE VARIEDADE (evitar monotonia em vídeo longo):
- NUNCA use o mesmo template em duas cenas seguidas.
- Intercale cenas DENSAS (concept_reveal, comparison_motion, steps_flow) com RESPIROS (stat_highlight, quote_spotlight, scenario_card).
- Use cada template novo (stat, quote, scenario, steps) ao menos uma vez se o conteúdo permitir; não force.

CALIBRE A DURAÇÃO PELO CONTEÚDO (não encha com repetição):
- Módulo ENXUTO → ~8 cenas de miolo (perto de 3 min). Módulo DENSO → até 14 cenas (perto de 5 min).
- Cada cena de miolo = ~18–26s de narração. Intro ~18–22s. Outro ~14–18s.
- Cada cena traz uma ideia NOVA do módulo. Cubra princípios, exemplos, erros×boas práticas, situações típicas.

PRINCÍPIOS DE ESCRITA:
- A NARRAÇÃO é falada — linguagem oral, frases curtas (≤20 palavras), natural. Sem markdown, sem emoji, sem indicação de cena.
- Os ELEMENTOS VISUAIS (title, bullets, items, quote, stat) são CURTOS — aparecem na tela. Exceção: subtitle de scenario_card pode ter 1-2 frases curtas.
- Fiel ao módulo; não invente leis/dados. Sem jargão. O narrador é a "Mentora Vertho" (feminino, acolhedor). NÃO cite o descritor no gancho.

PERSONALIZAÇÃO (este vídeo é feito sob medida para uma célula de colaboradores — mantenha o conteúdo pedagógico fiel ao módulo, mas adapte exemplos, situações, tom e ênfase):
- PERFIL COMPORTAMENTAL DOMINANTE: Dominante (D).
  - TOM da narração: Direto e decisivo. Foco em resultado, ação e impacto. Frases curtas, sem rodeios. Abra pelo "o que muda na prática".
  - ÊNFASE de layouts: Favoreça comparison_motion e steps_flow; use stat_highlight para impacto. (sem quebrar a regra de não repetir template adjacente).
- CARGO: ancore TODOS os exemplos, situações e o "scenario_card" no dia a dia real deste cargo (use o contexto abaixo). Nada genérico.
- ESCOLA/INSTITUIÇÃO (PPP): alinhe situações e vocabulário à realidade e aos valores da instituição abaixo. Não cite o nome da escola na narração; use o contexto para tornar os exemplos plausíveis e próximos.

Responda APENAS JSON válido (o miolo tem QUANTAS cenas o conteúdo pedir):
{
  "title": "título do vídeo",
  "theme": "tema curto",
  "scenes": [
    {"id":"scene-1","type":"avatar_intro","title":"2-4 palavras","subtitle":"subtítulo curto","narration":"..."},
    {"id":"scene-2","type":"scenario_card","title":"Imagine","subtitle":"uma situação curta...","narration":"..."},
    {"id":"scene-3","type":"concept_reveal","title":"...","bullets":["...","...","..."],"narration":"..."},
    {"id":"scene-4","type":"stat_highlight","stat":"73%","title":"rótulo","subtitle":"contexto","narration":"..."},
    {"id":"scene-5","type":"comparison_motion","title":"A x B","left":{"title":"...","items":["...","...","..."]},"right":{"title":"...","items":["...","...","..."]},"narration":"..."},
    {"id":"scene-6","type":"steps_flow","title":"...","items":["...","...","...","..."],"narration":"..."},
    {"id":"scene-7","type":"quote_spotlight","quote":"frase memorável","subtitle":"Mentora Vertho","narration":"..."},
    {"id":"scene-8","type":"icon_story","title":"...","items":["...","...","..."],"narration":"..."},
    "... mais cenas conforme o conteúdo ...",
    {"id":"scene-N","type":"avatar_outro","title":"...","subtitle":"pergunta prática","narration":"..."}
  ]
}
```

---

## USER PROMPT

> Exemplo real: módulo "Equidade na Prática", célula = cargo Professor(a) + PPP do Colégio Exemplo + perfil **D**. Os blocos de cargo e PPP só aparecem quando há célula.

```text
MÓDULO-BASE
- Competência: Práticas Pedagógicas
- Transição de nível: N1 → N2
- Título do módulo: Equidade na Prática: Da Igualdade de Recursos à Riqueza Cognitiva

IDEIA PRINCIPAL:
A equidade na educação básica não se realiza apenas pela distribuição uniforme de recursos ou pela adoção de pacotes pedagógicos padronizados. Ela exige que cada estudante tenha acesso a experiências cognitivamente ricas, culturalmente responsivas e orientadas pela curiosidade — transformando o papel do aluno de receptor passivo para investigador ativo do próprio aprendizado.

EXPLICAÇÃO EXPANDIDA:
## Equidade como experiência, não como recurso

Quando falamos em equidade educacional, é comum que o debate se concentre em distribuição de materiais, acesso à tecnologia ou uniformização de currículos. Essas são condições necessárias, mas insuficientes. O que realmente diferencia trajetórias de aprendizagem não é apenas o que está disponível para o aluno, mas a qualidade cognitiva da experiência que ele vivencia dentro e fora da sala de aula.

Igualdade significa oferecer os mesmos recursos a todos. Equidade significa reconhecer que cérebros diferentes, moldados por histórias, culturas e contextos distintos, precisam de experiências de aprendizado adaptadas para que todos alcancem patamares de desenvolvimento comparáveis. Essa distinção não é retórica — ela muda fundamentalmente o que um educador faz em sala de aula.

## A curiosidade como motor do desenvolvimento

Crianças nascem curiosas. O que a escola frequentemente faz, de forma não intencional, é substituir essa curiosidade natural por complacência: o comportamento de obedecer, completar tarefas e aguardar instruções, sem necessariamente compreender ou se engajar de forma profunda. Ambientes que priorizam silêncio, obediência passiva e respostas corretas em detrimento do processo de investigação tendem a produzir estudantes que sabem se comportar, mas não necessariamente aprender.

A aprendizagem ativa inverte essa lógica. Ela posiciona o estudante como agente: alguém que formula perguntas, testa hipóteses, erra, ajusta e constrói compreensão. Isso não elimina estrutura ou disciplina — ao contrário, exige uma organização pedagógica mais sofisticada, onde o educador atua como mediador do processo e não como único detentor do conhecimento.

## A luta produtiva como condição de crescimento

Um dos equívocos mais comuns na prática pedagógica é a tentativa de eliminar a dificuldade da experiência do aluno. Quando o educador antecipa cada obstáculo, fornece a resposta antes que o estudante tente, ou evita tarefas que possam gerar frustração, ele priva o aluno do que a neurociência cognitiva chama de 'luta produtiva': o período de desconforto intelectual em que o cérebro tenta conectar informações novas a estruturas já existentes.

Esse processo não é opcional — ele é o mecanismo central da aprendizagem profunda. O papel do educador não é eliminar a dificuldade, mas calibrá-la: criar desafios que estejam na zona de desenvolvimento proximal de cada estudante, acompanhar o processo com suporte adequado e ensinar o aluno a interpretar o erro como informação, não como evidência de incapacidade.

## Cultura como dado pedagógico

O ensino culturalmente responsivo frequentemente é reduzido a representatividade superficial: incluir personagens de diferentes origens nos materiais didáticos ou celebrar datas comemorativas. Isso é válido, mas não suficiente.

Cultura molda cognição. A forma como uma criança foi ensinada a aprender em casa — se por observação e prática, por narrativa oral, por exploração coletiva ou por instrução individual — influencia diretamente a forma como ela processa informação na escola. Educadores culturalmente responsivos compreendem esses padrões e adaptam suas estratégias de ensino para criar pontes entre o que o aluno já sabe fazer e o que a escola precisa que ele aprenda.

Isso é especialmente relevante em contextos com alta diversidade cultural, onde crianças provenientes de culturas coletivistas — que valorizam o aprendizado social, prático e contextualizado — podem ser avaliadas como 'menos engajadas' simplesmente porque seu modo natural de aprender não se encaixa no formato individualizado e silencioso da sala de aula tradicional.

## Feedback como ferramenta de desenvolvimento

Nenhuma prática pedagógica ativa funciona sem um sistema robusto de feedback formativo. Feedback não é sinônimo de nota ou conceito — é informação acionável, entregue em tempo hábil, focada no processo e orientada para a melhoria. Um ciclo de feedback bem estruturado responde a três perguntas: onde o aluno está agora, onde precisa chegar e o que pode fazer para avançar.

Quando o feedback é punitivo, tardio ou excessivamente centrado no resultado final, ele perde sua função pedagógica e passa a atuar como mecanismo de classificação. Isso reforça nos estudantes a ideia de que o objetivo da escola é ser avaliado — não aprender.

## A mentalidade acadêmica como condição de acesso

Além das práticas e estratégias, existe uma dimensão interna que determina se o estudante se permite aprender: a mentalidade acadêmica. Ela envolve a crença de que é capaz de aprender, o sentimento de pertencimento à comunidade escolar e a percepção de que o esforço tem valor. Estudantes que não desenvolvem essa mentalidade tendem a abandonar desafios precocemente, evitar riscos intelectuais e interpretar dificuldades como evidências de que 'não são para aquilo'.

Construir mentalidade acadêmica não é tarefa do psicólogo escolar — é responsabilidade pedagógica cotidiana. Cada interação entre educador e estudante contribui para reforçar ou enfraquecer essa percepção interna.

PRINCÍPIOS:
- Equidade como experiência cognitiva: Oferecer os mesmos recursos não garante equidade se as experiências de aprendizado não forem cognitivamente ricas e adaptadas ao desenvolvimento de cada estudante. A equidade real opera no nível da qualidade da experiência, não apenas da distribuição de insumos.
- Curiosidade como condição pedagógica: A curiosidade intelectual não é um traço inato fixo — é uma disposição que pode ser cultivada ou suprimida pelo ambiente escolar. Ambientes que priorizam obediência passiva tendem a substituir a curiosidade natural pela complacência.
- Luta produtiva como mecanismo de aprendizagem: O desconforto intelectual diante de um problema difícil não é obstáculo — é condição para o aprendizado profundo. O papel do educador é calibrar o nível de desafio, não eliminá-lo.
- Cultura como dado de planejamento pedagógico: A origem cultural de um estudante molda sua forma de processar e expressar conhecimento. Ignorar isso significa ensinar para um perfil hipotético de aluno, não para os estudantes reais da sala.
- Feedback como instrução, não como julgamento: Feedback formativo eficaz é acionável, focado no processo e entregue em tempo hábil. Quando reduzido a nota ou conceito final, perde sua função pedagógica e passa a classificar em vez de desenvolver.
- Mentalidade acadêmica como construção cotidiana: A crença do estudante em sua própria capacidade de aprender é construída (ou destruída) em cada interação com o educador e com o ambiente escolar. Não é um estado fixo — é uma percepção dinâmica.
- Erro como dado de aprendizagem: Tratar o erro como fracasso gera evitação. Tratar o erro como informação sobre o processo de compreensão permite que o estudante o use como ponto de partida para ajustes e avanços.

EXEMPLOS / APLICAÇÃO:
- adequada: O mesmo educador, revisando sua prática, aprende a diferenciar luta produtiva de abandono pedagógico. Passa a observar o processo de cada estudante, intervir com perguntas que orientam sem resolver — 'o que você já sabe sobre isso?', 'o que aconteceria se você tentasse por esse caminho?' — e oferece suporte escalonado conforme a necessidade, preservando o protagonismo do estudante.
- inadequada: Um educador, ao conhecer o conceito de luta produtiva, decide parar de dar qualquer suporte a estudantes com dificuldade, argumentando que 'precisam lutar sozinhos para aprender'. Sem suporte calibrado, os estudantes com maiores lacunas de base abandonam as tarefas ainda mais rapidamente, aprofundando a desigualdade em vez de reduzi-la.

ERROS COMUNS:
- Confundir silêncio e obediência com aprendizagem
- Eliminar a dificuldade para incluir
- Usar feedback apenas como avaliação de resultado
- Tratar ensino culturalmente responsivo como decoração curricular
- Apresentar a mentalidade de crescimento como mensagem motivacional genérica

BOAS PRÁTICAS:
- Criar rotinas explícitas de investigação no início ou durante as aulas
- Nomear e normalizar a luta produtiva explicitamente com os estudantes
- Estruturar devolutivas formativas durante o processo, antes da avaliação final
- Variar sistematicamente os formatos de aprendizagem dentro de uma mesma unidade
- Separar linguagem de desempenho de linguagem de capacidade

SITUAÇÕES TÍPICAS:
- Turma com alto índice de passividade — estudantes que completam tarefas corretamente mas raramente fazem perguntas, debatem ou demonstram curiosidade espontânea.: Transformar a dinâmica de sala sem perder organização, em um ambiente onde a cultura institucional valoriza silêncio e obediência como indicadores de aprendizagem.
- Estudante que evita tarefas difíceis, desiste rapidamente ou diz 'não sei' antes de tentar, demonstrando baixa tolerância à frustração intelectual.: Reconstruir a relação do estudante com a dificuldade sem infantilizar o processo ou tornar as atividades artificialmente fáceis.
- Turma culturalmente diversa, com estudantes cujos contextos familiares privilegiam aprendizado prático, oral e coletivo, mas a metodologia predominante é individualizada e baseada em texto escrito.: Adaptar estratégias pedagógicas sem abandonar os objetivos curriculares e sem tratar grupos culturais como homogêneos.
- Educador que utiliza avaliações frequentes mas percebe que os resultados não se traduzem em melhoria real do aprendizado — os estudantes corrigem erros pontuais mas não desenvolvem compreensão mais profunda.: Transformar a prática avaliativa de instrumento de classificação em instrumento de desenvolvimento, sem abandonar a necessidade institucional de registro de desempenho.
- Planejamento coletivo de práticas pedagógicas em equipe de educadores, onde há resistência à mudança de metodologia por parte de colegas mais experientes.: Promover reflexão pedagógica genuína sem gerar clima de julgamento ou hierarquia entre pares.

═══ CONTEXTO DA FUNÇÃO DO COLABORADOR ═══
Instituição: Colégio Exemplo
Cargo: Professor(a) do Ensino Fundamental (Regência) — sala de aula
Principais entregas: planejar aulas, avaliar aprendizagem, dar feedback aos alunos
Tensões comuns: turmas heterogêneas, tempo curto, pressão por resultado

═══ CONTEXTO DA INSTITUIÇÃO (PPP) ═══
Missão: formar cidadãos críticos e autônomos. Valores: acolhimento, protagonismo do estudante, equidade. Metodologia: aprendizagem ativa, projetos interdisciplinares.

Gere o roteiro completo (avatar_intro + miolo VARIADO dimensionado pelo conteúdo + avatar_outro), com 3 a 5 min de narração, no TOM do perfil Dominante (D). Responda só o JSON.
```

---

## USER PROMPT — versão genérica (sem célula)

> Mesmo módulo, sem personalização (vídeo canônico do módulo).

```text
MÓDULO-BASE
- Competência: Práticas Pedagógicas
- Transição de nível: N1 → N2
- Título do módulo: Equidade na Prática: Da Igualdade de Recursos à Riqueza Cognitiva

IDEIA PRINCIPAL:
A equidade na educação básica não se realiza apenas pela distribuição uniforme de recursos ou pela adoção de pacotes pedagógicos padronizados. Ela exige que cada estudante tenha acesso a experiências cognitivamente ricas, culturalmente responsivas e orientadas pela curiosidade — transformando o papel do aluno de receptor passivo para investigador ativo do próprio aprendizado.

EXPLICAÇÃO EXPANDIDA:
## Equidade como experiência, não como recurso

Quando falamos em equidade educacional, é comum que o debate se concentre em distribuição de materiais, acesso à tecnologia ou uniformização de currículos. Essas são condições necessárias, mas insuficientes. O que realmente diferencia trajetórias de aprendizagem não é apenas o que está disponível para o aluno, mas a qualidade cognitiva da experiência que ele vivencia dentro e fora da sala de aula.

Igualdade significa oferecer os mesmos recursos a todos. Equidade significa reconhecer que cérebros diferentes, moldados por histórias, culturas e contextos distintos, precisam de experiências de aprendizado adaptadas para que todos alcancem patamares de desenvolvimento comparáveis. Essa distinção não é retórica — ela muda fundamentalmente o que um educador faz em sala de aula.

## A curiosidade como motor do desenvolvimento

Crianças nascem curiosas. O que a escola frequentemente faz, de forma não intencional, é substituir essa curiosidade natural por complacência: o comportamento de obedecer, completar tarefas e aguardar instruções, sem necessariamente compreender ou se engajar de forma profunda. Ambientes que priorizam silêncio, obediência passiva e respostas corretas em detrimento do processo de investigação tendem a produzir estudantes que sabem se comportar, mas não necessariamente aprender.

A aprendizagem ativa inverte essa lógica. Ela posiciona o estudante como agente: alguém que formula perguntas, testa hipóteses, erra, ajusta e constrói compreensão. Isso não elimina estrutura ou disciplina — ao contrário, exige uma organização pedagógica mais sofisticada, onde o educador atua como mediador do processo e não como único detentor do conhecimento.

## A luta produtiva como condição de crescimento

Um dos equívocos mais comuns na prática pedagógica é a tentativa de eliminar a dificuldade da experiência do aluno. Quando o educador antecipa cada obstáculo, fornece a resposta antes que o estudante tente, ou evita tarefas que possam gerar frustração, ele priva o aluno do que a neurociência cognitiva chama de 'luta produtiva': o período de desconforto intelectual em que o cérebro tenta conectar informações novas a estruturas já existentes.

Esse processo não é opcional — ele é o mecanismo central da aprendizagem profunda. O papel do educador não é eliminar a dificuldade, mas calibrá-la: criar desafios que estejam na zona de desenvolvimento proximal de cada estudante, acompanhar o processo com suporte adequado e ensinar o aluno a interpretar o erro como informação, não como evidência de incapacidade.

## Cultura como dado pedagógico

O ensino culturalmente responsivo frequentemente é reduzido a representatividade superficial: incluir personagens de diferentes origens nos materiais didáticos ou celebrar datas comemorativas. Isso é válido, mas não suficiente.

Cultura molda cognição. A forma como uma criança foi ensinada a aprender em casa — se por observação e prática, por narrativa oral, por exploração coletiva ou por instrução individual — influencia diretamente a forma como ela processa informação na escola. Educadores culturalmente responsivos compreendem esses padrões e adaptam suas estratégias de ensino para criar pontes entre o que o aluno já sabe fazer e o que a escola precisa que ele aprenda.

Isso é especialmente relevante em contextos com alta diversidade cultural, onde crianças provenientes de culturas coletivistas — que valorizam o aprendizado social, prático e contextualizado — podem ser avaliadas como 'menos engajadas' simplesmente porque seu modo natural de aprender não se encaixa no formato individualizado e silencioso da sala de aula tradicional.

## Feedback como ferramenta de desenvolvimento

Nenhuma prática pedagógica ativa funciona sem um sistema robusto de feedback formativo. Feedback não é sinônimo de nota ou conceito — é informação acionável, entregue em tempo hábil, focada no processo e orientada para a melhoria. Um ciclo de feedback bem estruturado responde a três perguntas: onde o aluno está agora, onde precisa chegar e o que pode fazer para avançar.

Quando o feedback é punitivo, tardio ou excessivamente centrado no resultado final, ele perde sua função pedagógica e passa a atuar como mecanismo de classificação. Isso reforça nos estudantes a ideia de que o objetivo da escola é ser avaliado — não aprender.

## A mentalidade acadêmica como condição de acesso

Além das práticas e estratégias, existe uma dimensão interna que determina se o estudante se permite aprender: a mentalidade acadêmica. Ela envolve a crença de que é capaz de aprender, o sentimento de pertencimento à comunidade escolar e a percepção de que o esforço tem valor. Estudantes que não desenvolvem essa mentalidade tendem a abandonar desafios precocemente, evitar riscos intelectuais e interpretar dificuldades como evidências de que 'não são para aquilo'.

Construir mentalidade acadêmica não é tarefa do psicólogo escolar — é responsabilidade pedagógica cotidiana. Cada interação entre educador e estudante contribui para reforçar ou enfraquecer essa percepção interna.

PRINCÍPIOS:
- Equidade como experiência cognitiva: Oferecer os mesmos recursos não garante equidade se as experiências de aprendizado não forem cognitivamente ricas e adaptadas ao desenvolvimento de cada estudante. A equidade real opera no nível da qualidade da experiência, não apenas da distribuição de insumos.
- Curiosidade como condição pedagógica: A curiosidade intelectual não é um traço inato fixo — é uma disposição que pode ser cultivada ou suprimida pelo ambiente escolar. Ambientes que priorizam obediência passiva tendem a substituir a curiosidade natural pela complacência.
- Luta produtiva como mecanismo de aprendizagem: O desconforto intelectual diante de um problema difícil não é obstáculo — é condição para o aprendizado profundo. O papel do educador é calibrar o nível de desafio, não eliminá-lo.
- Cultura como dado de planejamento pedagógico: A origem cultural de um estudante molda sua forma de processar e expressar conhecimento. Ignorar isso significa ensinar para um perfil hipotético de aluno, não para os estudantes reais da sala.
- Feedback como instrução, não como julgamento: Feedback formativo eficaz é acionável, focado no processo e entregue em tempo hábil. Quando reduzido a nota ou conceito final, perde sua função pedagógica e passa a classificar em vez de desenvolver.
- Mentalidade acadêmica como construção cotidiana: A crença do estudante em sua própria capacidade de aprender é construída (ou destruída) em cada interação com o educador e com o ambiente escolar. Não é um estado fixo — é uma percepção dinâmica.
- Erro como dado de aprendizagem: Tratar o erro como fracasso gera evitação. Tratar o erro como informação sobre o processo de compreensão permite que o estudante o use como ponto de partida para ajustes e avanços.

EXEMPLOS / APLICAÇÃO:
- adequada: O mesmo educador, revisando sua prática, aprende a diferenciar luta produtiva de abandono pedagógico. Passa a observar o processo de cada estudante, intervir com perguntas que orientam sem resolver — 'o que você já sabe sobre isso?', 'o que aconteceria se você tentasse por esse caminho?' — e oferece suporte escalonado conforme a necessidade, preservando o protagonismo do estudante.
- inadequada: Um educador, ao conhecer o conceito de luta produtiva, decide parar de dar qualquer suporte a estudantes com dificuldade, argumentando que 'precisam lutar sozinhos para aprender'. Sem suporte calibrado, os estudantes com maiores lacunas de base abandonam as tarefas ainda mais rapidamente, aprofundando a desigualdade em vez de reduzi-la.

ERROS COMUNS:
- Confundir silêncio e obediência com aprendizagem
- Eliminar a dificuldade para incluir
- Usar feedback apenas como avaliação de resultado
- Tratar ensino culturalmente responsivo como decoração curricular
- Apresentar a mentalidade de crescimento como mensagem motivacional genérica

BOAS PRÁTICAS:
- Criar rotinas explícitas de investigação no início ou durante as aulas
- Nomear e normalizar a luta produtiva explicitamente com os estudantes
- Estruturar devolutivas formativas durante o processo, antes da avaliação final
- Variar sistematicamente os formatos de aprendizagem dentro de uma mesma unidade
- Separar linguagem de desempenho de linguagem de capacidade

SITUAÇÕES TÍPICAS:
- Turma com alto índice de passividade — estudantes que completam tarefas corretamente mas raramente fazem perguntas, debatem ou demonstram curiosidade espontânea.: Transformar a dinâmica de sala sem perder organização, em um ambiente onde a cultura institucional valoriza silêncio e obediência como indicadores de aprendizagem.
- Estudante que evita tarefas difíceis, desiste rapidamente ou diz 'não sei' antes de tentar, demonstrando baixa tolerância à frustração intelectual.: Reconstruir a relação do estudante com a dificuldade sem infantilizar o processo ou tornar as atividades artificialmente fáceis.
- Turma culturalmente diversa, com estudantes cujos contextos familiares privilegiam aprendizado prático, oral e coletivo, mas a metodologia predominante é individualizada e baseada em texto escrito.: Adaptar estratégias pedagógicas sem abandonar os objetivos curriculares e sem tratar grupos culturais como homogêneos.
- Educador que utiliza avaliações frequentes mas percebe que os resultados não se traduzem em melhoria real do aprendizado — os estudantes corrigem erros pontuais mas não desenvolvem compreensão mais profunda.: Transformar a prática avaliativa de instrumento de classificação em instrumento de desenvolvimento, sem abandonar a necessidade institucional de registro de desempenho.
- Planejamento coletivo de práticas pedagógicas em equipe de educadores, onde há resistência à mudança de metodologia por parte de colegas mais experientes.: Promover reflexão pedagógica genuína sem gerar clima de julgamento ou hierarquia entre pares.

Gere o roteiro completo (avatar_intro + miolo VARIADO dimensionado pelo conteúdo + avatar_outro), com 3 a 5 min de narração. Responda só o JSON.
```
