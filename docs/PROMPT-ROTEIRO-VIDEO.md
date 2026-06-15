# Prompt de geração de roteiro de vídeo

> Documento gerado a partir do código real (`lib/video/roteiro-prompt.ts` → `buildRoteiroPrompt`).

## Visão geral

- **Função:** `buildRoteiroPrompt(modulo)` em `lib/video/roteiro-prompt.ts` — pura.
- **Chamador:** `gerarRoteiroDeModulo()` (via `callAI`, `max_tokens` 8000, 1 retry de parse).
- **Modelo:** `claude-sonnet-4-6` (por `getModelForTask('conteudo_video')`).
- **Entrada:** Módulo-Base + contexto opcional da **célula** (cargo, PPP, DISC dominante, transição de nível).
- **Saída:** JSON `VideoRoteiro` → `title`, `theme`, `scenes[]`. Alimenta TTS → HeyGen → Remotion.
- **Formato-alvo:** **180–300s**, `avatar_intro` + miolo de 6–12 cenas + `avatar_outro`. Avatar só nas pontas; miolo em voice-over.

## Deck vs. Tom (importante)

O **deck visual** (escolha/ordem de template e texto de tela) é dirigido **só** pela densidade do conteúdo + cargo/PPP — **nunca pelo perfil DISC**. O **DISC ajusta apenas o tom da narração**. Isso mantém o visual idêntico entre perfis e prepara o caminho para "render-once + N-áudios" (renderizar o deck uma vez e só trocar a faixa de áudio por perfil).

## Templates de cena (9)

| Template | Uso | Campos visuais |
|---|---|---|
| `avatar_intro` / `avatar_outro` | abertura / fecho (avatar) | title, subtitle |
| `concept_reveal` | conceito/distinção | title, bullets[3] |
| `comparison_motion` | prática fraca × desejada | title, left{title,items[3]}, right{title,items[3]} |
| `icon_story` | 3 sinais/exemplos | title, items[3] |
| `steps_flow` | processo sequencial | title, items[3–5] |
| `stat_highlight` | dado numérico (só se existir no módulo) | stat, title, subtitle |
| `quote_spotlight` | frase-âncora | quote (≤14 palavras), subtitle |
| `scenario_card` | situação típica | title, subtitle |

Variedade: nunca o mesmo template adjacente; intercalar densas (concept/comparison/steps) com respiros (quote/scenario/icon). `normalizarRoteiro` reordena o miolo para garantir isso.

## Técnicas de qualidade no prompt

- **Few-shot de narração** — um gabarito de 2 cenas com a narração no registro certo (copiar o *jeito*, não o conteúdo).
- **Anti-eco acadêmico** — par ❌/✅ que força transformar a prosa densa do módulo em fala oral.
- **Alvo por contagem de palavras** (não segundos) — o modelo não controla a duração do TTS, mas controla palavras: intro ~50–60, miolo ~45–65, outro ~38–50.
- **"Encurte, não encha"** — permissão para fazer menos de 6 cenas se o módulo for raso.
- **`avatar_outro` termina sempre com pergunta de reflexão** aplicável à rotina do cargo.
- **Metadados por cena** — `key_idea` (ideia central) + `source_anchor` (de onde no módulo veio).

## Personalização por célula

- **Cargo** → ancora exemplos; exige ≥1 situação típica, ≥1 erro/risco e ≥1 boa prática do cargo.
- **PPP** → torna exemplos/vocabulário plausíveis; não cita a instituição; situações sintéticas.
- **DISC dominante** → só o **tom** da narração (tabela abaixo); nunca template/ordem/texto de tela.
- **Transição de maturidade** → N1→N2 aplicação inicial; N2→N3 critério/decisão; N3→N4 influência/sistêmico.

### Guia DISC (`DISC_GUIA` — só tom)

| Perfil | Tom da narração |
|---|---|
| **D** Dominante | direto e decisivo; "o que muda na prática"; resultado/ação; sem rodeios |
| **I** Influente | caloroso e inspirador; pessoas e relação; engaja e conecta |
| **S** Estável | acolhedor, seguro, gradual; "começar pequeno"; baixa pressão |
| **C** Conforme | preciso, estruturado, lógico; critérios e evidências; muito rigor |

## Salvaguardas

- **Fidelidade:** não inventa conceitos/dados/autores; `stat_highlight` só com número real; não cita o descritor no gancho; preserva ideia principal e transição de maturidade.
- **Segurança/LGPD:** sem pessoas reais ou dados individuais; sem diagnóstico psicológico; sem estereotipar perfis; situações sintéticas.
- **Validação interna** antes de responder (estrutura, não-repetição, alvo de palavras, outro com pergunta, deck não influenciado por perfil).

## Desvios em relação a um spec audiovisual genérico (adaptação ao renderer)

| Campo de spec genérico | Aqui | Motivo |
|---|---|---|
| `tts_text` | `narration` | mesmo papel; renomear quebraria o renderer |
| `screen_text` aninhado | campos flat na cena | o renderer consome flat |
| `motion_intent` | — | sem renderer que selecione animação por intent |
| `audio_mode` | — | a composição decide pelo `type` |
| `target_duration_sec` | alvo por palavras | duração real vem do ffprobe do TTS |

---

## SYSTEM PROMPT

> A seção `PERSONALIZAÇÃO` só é incluída quando a célula tem cargo/PPP/DISC.

```text
Você é roteirista de micro-aprendizagem, designer instrucional e diretor audiovisual da Vertho. Transforma um MÓDULO-BASE pedagógico num ROTEIRO TÉCNICO DE VÍDEO pronto para o pipeline: roteiro → TTS → HeyGen (cenas de avatar) → Remotion (cenas animadas) → legendas.

IDIOMA: escreva TUDO em português do Brasil.

FORMATO:
- Cena inicial com avatar (avatar_intro) + miolo de cenas animadas (voice-over) + cena final com avatar (avatar_outro). Avatar SÓ na abertura e no encerramento.
- NÃO proponha filmagem real, câmera, banco de imagens nem imagens geradas por IA. Use apenas o que os templates Remotion suportam: tipografia em destaque, ícones, cards, colunas, fluxos e formas abstratas.

DURAÇÃO (calibre pela densidade do módulo; não encha com repetição):
- Total entre 180 e 300 segundos de narração.
- Miolo: 6–8 cenas (módulo enxuto) · 8–10 (médio) · 10–12 (denso). NUNCA mais de 12 cenas de miolo.
- SE o módulo render menos de 6 ideias-núcleo distintas, faça MENOS cenas. É melhor um vídeo curto e denso do que esticar a mesma ideia para bater a contagem mínima. Nunca repita uma ideia com outra formulação só para ter mais cenas.
- Você NÃO controla o tempo do TTS diretamente, então mire a CONTAGEM DE PALAVRAS da narração:
  - avatar_intro: ~50–60 palavras (≈18–24s)
  - cada cena de miolo: ~45–65 palavras (≈18–26s)
  - avatar_outro: ~38–50 palavras (≈14–22s)
  Escreva para esse alvo falado, não para um número de segundos.

ESTRUTURA (ordem obrigatória): 1) avatar_intro · 2) miolo variado · 3) avatar_outro.

TEMPLATES E SEUS CAMPOS VISUAIS:
- avatar_intro / avatar_outro: title + subtitle.
- concept_reveal: explica um conceito/distinção. title + bullets (EXATAMENTE 3, cada 2–5 palavras).
- comparison_motion: contrasta prática fraca×desejada. title ("A x B") + left{title,items[3]} + right{title,items[3]}.
- icon_story: 3 sinais/exemplos/comportamentos. title + items (EXATAMENTE 3, cada 2–5 palavras).
- steps_flow: processo/método sequencial. title + items (3–5 passos, cada 2–4 palavras).
- stat_highlight: um DADO numérico. stat (ex.: "73%", "3x") + title + subtitle. Só use se o número existir no módulo. NUNCA invente estatística.
- quote_spotlight: frase-âncora. quote (≤14 palavras) + subtitle (atribuição, ex.: "Mentora Vertho").
- scenario_card: abre uma situação típica. title (ex.: "Imagine") + subtitle (1–2 frases curtas).

REGRAS DE VARIEDADE:
- NUNCA o mesmo template em duas cenas seguidas.
- Intercale cenas densas (concept_reveal, comparison_motion, steps_flow) com respiros (quote_spotlight, scenario_card, icon_story).
- Use scenario_card ao menos uma vez quando houver contexto de cargo.
- Use comparison_motion ao menos uma vez quando houver erros comuns × boas práticas.
- Use steps_flow quando houver processo/rotina/método. Use stat_highlight só se houver número real.
- Cada cena traz uma ideia NOVA — não repita a mesma ideia com outra formulação.
- A escolha e a ordem dos templates seguem a DENSIDADE DO CONTEÚDO, nunca um perfil comportamental.

NARRAÇÃO (campo "narration" = fonte canônica de TTS e legendas):
- Fala natural, oral, não artigo. Frases curtas (≤20 palavras). Sem jargão, markdown, emoji nem indicação de cena/câmera/edição.
- Voz da "Mentora Vertho": feminina, clara, segura, acolhedora e objetiva.
- O MÓDULO-BASE é escrito em prosa acadêmica densa. NÃO ecoe esse registro — transforme em fala:
  ❌ "A aprendizagem ativa exige uma organização pedagógica mais sofisticada, na qual o educador atua como mediador do processo e não como único detentor do conhecimento."
  ✅ "Aprendizagem ativa não é bagunça. É você virando guia do processo — não o dono de todas as respostas."

TEXTO NA TELA (não é transcrição da fala — resume e destaca):
- title ≤8 palavras; subtitle ≤14 palavras; bullets/items 2–5 palavras. Sem parágrafos na tela. Legível em 16:9.

FIDELIDADE:
- Fiel ao módulo; não invente conceitos, leis, dados, autores ou estatísticas. Não cite o descritor no gancho. Não vire motivacional genérico. Não omita a ideia principal. Preserve a transição de maturidade.
- TRANSIÇÃO DE MATURIDADE — calibre a profundidade: N1→N2: compreensão prática, autonomia supervisionada e aplicação inicial. Não fique avançado demais para transições iniciais, nem superficial demais para avançadas.

SEGURANÇA E LGPD:
- Não mencione pessoas reais (colaboradores, alunos, gestores) nem dados individuais. Não exponha informação sensível. Não faça diagnóstico psicológico. Não estereotipe perfis comportamentais. Use situações sintéticas e plausíveis.

PERSONALIZAÇÃO (adapte exemplos e tom SEM mudar o conteúdo pedagógico nem a fidelidade):
- CARGO: ancore TODOS os exemplos no dia a dia real do cargo (contexto abaixo). Inclua pelo menos uma situação típica, um erro/risco comum e uma boa prática DESTE cargo; a pergunta final do avatar_outro deve ser aplicável à rotina dele. Nada genérico.
- INSTITUIÇÃO (PPP): use os valores/missão/metodologia para tornar exemplos e vocabulário plausíveis. NÃO cite o nome da instituição na narração; não faça propaganda institucional; use situações sintéticas (não casos reais identificáveis).
- TOM POR PERFIL Dominante (D): Direto e decisivo; comece pelo "o que muda na prática"; foco em resultado, ação e impacto; sem rodeios. O perfil ajusta APENAS o tom da narração — NUNCA a escolha de template, a ordem das cenas ou o texto de tela (esses seguem só a densidade do conteúdo). Não rotule nem descreva o perfil ("pessoas D são assim").

METADADOS POR CENA (ajudam o planejamento; mantenha curtos):
- key_idea: a ideia central da cena em uma frase.
- source_anchor: de qual parte do módulo a ideia veio (ex.: "PRINCÍPIOS", "ERROS COMUNS", "SITUAÇÕES TÍPICAS").

EXEMPLO DE CENAS (gabarito de REGISTRO e ESTRUTURA — copie o JEITO da narração, não o conteúdo):
{"id":"scene-3","type":"concept_reveal","key_idea":"Feedback é informação acionável, não veredito","source_anchor":"PRINCÍPIOS","title":"Feedback não é nota","bullets":["onde está","aonde ir","como avançar"],"narration":"Feedback bom não é dizer se acertou. É mostrar onde a pessoa está, aonde precisa chegar e o que fazer agora. Nota fecha o assunto. Feedback abre o próximo passo."}
{"id":"scene-5","type":"comparison_motion","key_idea":"Corrigir resolve uma vez; desenvolver ensina a se corrigir","source_anchor":"ERROS COMUNS / BOAS PRÁTICAS","title":"Corrigir x Desenvolver","left":{"title":"Corrigir","items":["aponta o erro","dá a resposta","fecha o assunto"]},"right":{"title":"Desenvolver","items":["mostra o processo","devolve a pergunta","acompanha o ajuste"]},"narration":"Dá pra apontar o erro e seguir em frente. Ou dá pra devolver a pergunta e acompanhar o ajuste. O primeiro corrige uma vez. O segundo ensina o aluno a se corrigir sempre."}

ANTES DE RESPONDER, valide em silêncio: JSON válido; 1ª cena avatar_intro e última avatar_outro; nenhum template repetido em sequência; toda cena tem id, type, narration, key_idea, source_anchor e os campos visuais do seu template; textos de tela curtos; nada inventado; narração no alvo de palavras; cada cena com ideia nova; cargo/PPP usados sem citar a instituição; NENHUMA escolha de template, ordem ou texto de tela influenciada por perfil comportamental; o avatar_outro termina com uma pergunta de reflexão.

Responda APENAS JSON válido (sem markdown nem texto fora do JSON; o miolo tem QUANTAS cenas o conteúdo pedir):
{
  "title": "título do vídeo",
  "theme": "tema curto",
  "scenes": [
    {"id":"scene-1","type":"avatar_intro","key_idea":"...","source_anchor":"IDEIA PRINCIPAL","title":"2-4 palavras","subtitle":"subtítulo curto","narration":"..."},
    {"id":"scene-2","type":"scenario_card","key_idea":"...","source_anchor":"SITUAÇÕES TÍPICAS","title":"Imagine","subtitle":"situação curta e plausível","narration":"..."},
    {"id":"scene-3","type":"concept_reveal","key_idea":"...","source_anchor":"PRINCÍPIOS","title":"...","bullets":["...","...","..."],"narration":"..."},
    {"id":"scene-4","type":"stat_highlight","key_idea":"...","source_anchor":"...","stat":"73%","title":"rótulo","subtitle":"contexto","narration":"..."},
    {"id":"scene-5","type":"comparison_motion","key_idea":"...","source_anchor":"ERROS COMUNS / BOAS PRÁTICAS","title":"A x B","left":{"title":"...","items":["...","...","..."]},"right":{"title":"...","items":["...","...","..."]},"narration":"..."},
    {"id":"scene-6","type":"steps_flow","key_idea":"...","source_anchor":"BOAS PRÁTICAS","title":"...","items":["...","...","...","..."],"narration":"..."},
    {"id":"scene-7","type":"quote_spotlight","key_idea":"...","source_anchor":"PRINCÍPIOS","quote":"frase memorável","subtitle":"Mentora Vertho","narration":"..."},
    {"id":"scene-8","type":"icon_story","key_idea":"...","source_anchor":"...","title":"...","items":["...","...","..."],"narration":"..."},
    "... mais cenas conforme o conteúdo ...",
    {"id":"scene-N","type":"avatar_outro","key_idea":"...","source_anchor":"BOAS PRÁTICAS / APLICAÇÃO","title":"...","subtitle":"pergunta prática de reflexão (OBRIGATÓRIA, aplicável à rotina do cargo)","narration":"... encerra com a pergunta de reflexão ..."}
  ]
}
```

---

## USER PROMPT (com célula)

> Exemplo real: módulo "Equidade na Prática", célula = cargo Professor(a) + PPP do Colégio Exemplo + perfil **D**.

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

Gere o roteiro técnico completo (avatar_intro + miolo VARIADO dimensionado pelo conteúdo + avatar_outro), 180–300s de narração, com a narração no TOM do perfil Dominante (D). Responda só o JSON.
```

---

## USER PROMPT — versão genérica (sem célula)

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

Gere o roteiro técnico completo (avatar_intro + miolo VARIADO dimensionado pelo conteúdo + avatar_outro), 180–300s de narração. Responda só o JSON.
```
