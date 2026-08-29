# Templates de cena do vídeo

Referência dos **13 templates de cena** que compõem um vídeo Vertho: **2 templates de avatar** (`avatar_intro` / `avatar_outro`, nas pontas) + **11 templates de miolo** (o corpo animado, entre as pontas). Fonte canônica dos campos: `lib/video/roteiro-prompt.ts` (descrições no prompt + `MIOLO_TIPOS`). Renderização: `video-spike/remotion/VideoCompositionV3.tsx:19` (switch `renderSceneVisual`) + componentes em `video-spike/remotion/scenes/`.

> O vídeo tem sempre: **1) `avatar_intro`** (avatar fala, abre o tema) → **2) miolo variado (6–12 cenas)** → **3) `avatar_outro`** (avatar fala, fecha com pergunta). Avatar **só** nas pontas. O miolo é 100% animação Remotion (tipografia, ícones, cards, formas) com voice-over — sem filmagem, câmera ou imagem gerada por IA.

> **Legendas e animação (timing por palavra):** as legendas usam o texto da `narration` + o **timing por palavra do Whisper** (transcreve o mp3 da narração — só ASR, não gera áudio). As revelações de elementos de cada cena são sincronizadas com a **janela de fala** (cada bullet/passo/degrau entra quando a frase correspondente é dita). Ver `lib/video/whisper-align.ts` + `lib/video/montar-inputprops.ts`.

## Campos comuns a toda cena de miolo

Todo objeto de cena no JSON do roteiro traz, além dos campos visuais do template:

| Campo | Descrição |
|---|---|
| `id` | `scene-N` (re-sequenciado na normalização) |
| `type` | um dos 11 tipos de miolo abaixo |
| `key_idea` | frase curta com a ideia central da cena |
| `source_anchor` | de onde a ideia veio (`PRINCIPIOS:<nome>`, `ERROS_COMUNS`, `BOAS_PRATICAS`, `SITUACOES_TIPICAS`, `CARGO`, `PPP`, etc.) |
| `estimated_words` | ≈ palavras da narração (cada cena de miolo: **45–65 palavras**) |
| `narration` | fonte canônica do TTS e das legendas — fala oral, frases ≤20 palavras |

**Texto de tela** (não é transcrição da fala — resume e destaca): `title` ≤8 palavras; `subtitle` ≤14 palavras; `bullets`/`items` de 2–5 palavras. Sem parágrafos na tela; legível em 16:9.

---

# Templates de avatar (pontas)

As duas únicas cenas em que o **avatar fala** (vídeo MP4 com lip-sync — HeyGen ou MuseTalk). Compartilham o mesmo layout e os mesmos campos; mudam o papel e a contagem de palavras. São **obrigatórias e fixas**: `avatar_intro` é sempre a 1ª cena, `avatar_outro` sempre a última.

**Render** (`AvatarClipV2.tsx`): o vídeo do avatar (HeyGen Talking Photo, **1080p**) ocupa a faixa direita; à esquerda, em safe area, uma coluna de texto com `title` (grande) + `subtitle`. O avatar é o único elemento com fala; o miolo é voice-over puro.

> **Lip-sync (corrigido):** o clip do HeyGen sai a 25fps e a composição roda a 30fps — o resample do `OffthreadVideo` causava drift. Fix: re-encode para **30fps CFR** (`normalizarFps`, ffmpeg) + o vídeo entra **mutado** e o áudio da narração (mp3) é tocado **separado** pelo Remotion, alinhado por frame. O re-encode roda na task `gerar-video-modulo` em máquina `large-1x` (na `small-1x` o ffmpeg pendurava).

## A. `avatar_intro` — abertura

Abre o tema, prende a atenção e contextualiza. **Narração: 26–30 palavras (~15s).** Não cita o descritor no gancho (prende primeiro, nomeia depois). Curto e direto — prende e contextualiza sem encher.

**Campos visuais:** `title` (2–4 palavras) + `subtitle` (curto).

```json
{"id":"scene-1","type":"avatar_intro","key_idea":"Estar ocupado não é o mesmo que progredir","source_anchor":"IDEIA_PRINCIPAL","estimated_words":28,"title":"Movimento não é direção","subtitle":"Por que correr o dia todo nem sempre aproxima do destino","narration":"Tem dias em que você termina exausto e sente que não saiu do lugar. A agenda lotou, mas o que importava continua parado. Tudo isso está te levando aonde você quer chegar?"}
```

## B. `avatar_outro` — encerramento

Fecha o vídeo com uma **pergunta de reflexão prática e acionável**, aplicável à rotina do cargo. **Narração: 22–26 palavras (~14s).** Fecha com punch, sem encher.

> **Config de produção (17/06):** avatar dimensionado para **~30s no total** (intro ~15s + outro ~14s) — controla o custo HeyGen. Antes era 50–60/38–50 palavras (~50s).
>
> **Custo HeyGen cravado (billing real, 19/06):** Talking Photo = "standard generation" = **$1,00/min = $0,0167/s** (≈ 1 crédito/s). **720p e 1080p custam idêntico** (resolução não muda o consumo → Full HD saiu de graça). ~30s previstos ≈ **$0,50/deck**; no deck real medido (22,9s de avatar) ficou **~$0,38**. Diluído pelo reuso na célula (cada pessoa adicional ≈ $0,01, só o greeting da Rota A).

**Campos visuais:** `title` (curto) + `subtitle` (a pergunta, curta e acionável).

```json
{"id":"scene-10","type":"avatar_outro","key_idea":"Converter o conceito em um ajuste concreto da semana","source_anchor":"BOAS_PRATICAS","estimated_words":24,"title":"Sua próxima semana","subtitle":"Qual tarefa cheia de movimento você faz que não te aproxima do destino?","narration":"Fica uma pergunta para a semana. Entre tudo o que você faz no automático, qual tarefa tem muito movimento e pouca direção? Escolha uma e troque."}
```

---

# Templates de miolo

## 1. `concept_reveal` — explica um conceito/distinção

Cena densa. Apresenta um conceito ou uma distinção em 3 pontos.

**Campos visuais:** `title` + `bullets` (**exatamente 3**, cada 2–5 palavras).

**Render** (`ConceptRevealV2.tsx`): título grande + 3 bullets que entram em sequência, cada um com ícone distinto, conectados por uma linha-guia vertical.

```json
{"id":"scene-3","type":"concept_reveal","key_idea":"Feedback é informação acionável, não veredito","source_anchor":"PRINCIPIOS:Feedback como instrução","estimated_words":35,"title":"Feedback não é nota","bullets":["onde está","aonde ir","como avançar"],"narration":"Feedback bom não é dizer se acertou. É mostrar onde a pessoa está, aonde precisa chegar e o que fazer agora. Nota fecha o assunto. Feedback abre o próximo passo."}
```

---

## 2. `comparison_motion` — contrasta prática fraca × desejada

Cena densa. Dois lados lado a lado mostrando o contraste entre o que evitar e o que buscar.

**Campos visuais:** `title` (no formato "A x B") + `left{ title, items[3] }` + `right{ title, items[3] }`.

**Render** (`ComparisonMotionV2.tsx`): duas colunas (esquerda = prática fraca, direita = desejada), 3 itens cada, com uma seta de evolução central.

```json
{"id":"scene-5","type":"comparison_motion","key_idea":"Corrigir resolve uma vez; desenvolver ensina a se corrigir","source_anchor":"ERROS_COMUNS / BOAS_PRATICAS","estimated_words":41,"title":"Corrigir x Desenvolver","left":{"title":"Corrigir","items":["aponta o erro","dá a resposta","fecha o assunto"]},"right":{"title":"Desenvolver","items":["mostra o processo","devolve a pergunta","acompanha o ajuste"]},"narration":"Dá para apontar o erro e seguir em frente. Ou dá para devolver a pergunta e acompanhar o ajuste. O primeiro corrige uma vez. O segundo ensina o aluno a se corrigir sempre."}
```

**Quando usar:** ao menos uma vez quando o módulo tiver erros × boas práticas.

---

## 3. `icon_story` — 3 sinais / exemplos / comportamentos

Respiro. Três elementos curtos representados por ícones grandes.

**Campos visuais:** `title` + `items` (**exatamente 3**, cada 2–5 palavras).

**Render** (`IconStoryV2.tsx`): 3 cards flutuantes com ícone grande e título curto, entrando em sequência (efeito spring-in) com glow.

```json
{"id":"scene-6","type":"icon_story","key_idea":"Três sinais de que o aluno travou","source_anchor":"SITUACOES_TIPICAS","estimated_words":48,"title":"Quando ele trava","items":["silêncio longo","repete o erro","desiste rápido"],"narration":"Dá para perceber quando alguém empacou. Vem o silêncio que se estende. O mesmo erro que volta. A desistência rápida ao primeiro obstáculo. Três sinais para você não passar batido."}
```

---

## 4. `steps_flow` — processo / método sequencial

Cena densa. Um método ou rotina em passos numerados.

**Campos visuais:** `title` + `items` (**3 a 5 passos**, cada 2–4 palavras).

**Render** (`StepsFlowV2.tsx`): passos numerados em círculos conectados por um trilho com progresso animado.

```json
{"id":"scene-7","type":"steps_flow","key_idea":"Roteiro de uma devolutiva que desenvolve","source_anchor":"BOAS_PRATICAS","estimated_words":52,"title":"Devolutiva em 4 passos","items":["descreva o fato","mostre o impacto","peça a leitura","combine o ajuste"],"narration":"Uma boa devolutiva tem ritmo. Descreva o fato sem rótulo. Mostre o impacto real. Peça a leitura da própria pessoa. E combinem juntos o próximo ajuste. Simples, mas muda tudo."}
```

**Quando usar:** quando houver processo, rotina ou método.

---

## 5. `stat_highlight` — um dado numérico

Respiro de alto impacto. Um único número em destaque.

**Campos visuais:** `stat` (o número) + `title` + `subtitle`.

**Render** (`StatHighlightV2.tsx`): número/percentual gigante (~340px) com count-up animado + subtítulo de contexto.

> ⚠️ **Só use se houver número EXPLÍCITO no módulo.** O valor de `stat` deve aparecer **literalmente** no conteúdo de entrada. A IA **nunca** inventa estatística — por isso este é o template menos frequente (o deck "Movimento não é direção", p.ex., não o usou).

```json
{"id":"scene-4","type":"stat_highlight","key_idea":"A maior parte do esquecimento acontece cedo","source_anchor":"EXPLICACAO_EXPANDIDA:curva do esquecimento","estimated_words":40,"stat":"70%","title":"esquecido em uma semana","subtitle":"sem retomada, o conteúdo evapora","narration":"Tem um dado que incomoda. Boa parte do que se aprende sem retomar se perde já na primeira semana. Não é falta de esforço. É como a memória funciona quando ninguém volta ao tema."}
```

---

## 6. `quote_spotlight` — frase-âncora

Respiro. Uma frase memorável em tela limpa.

**Campos visuais:** `quote` (**≤14 palavras**) + `subtitle` (atribuição, ex.: "Mentora Vertho").

**Render** (`QuoteSpotlightV2.tsx`): frase-âncora grande (~86px) em tela limpa, com aspas gigantes, atribuição e uma linha decorativa horizontal.

```json
{"id":"scene-8","type":"quote_spotlight","key_idea":"Síntese memorável do conceito central","source_anchor":"IDEIA_PRINCIPAL","estimated_words":30,"quote":"Movimento não é direção.","subtitle":"Mentora Vertho","narration":"Fica com uma frase. Movimento não é direção. Dá para passar o dia ocupado e não sair do lugar. O que muda o jogo não é fazer mais. É fazer o que aproxima do destino."}
```

---

## 7. `scenario_card` — abre uma situação típica

Respiro. Coloca o espectador dentro de uma cena reconhecível do dia a dia.

**Campos visuais:** `title` (ex.: "Imagine") + `subtitle` (1–2 frases curtas).

**Render** (`ScenarioCardV2.tsx`): box arredondado com ícone de chat + título e subtítulo descrevendo o contexto.

```json
{"id":"scene-2","type":"scenario_card","key_idea":"Situação típica do cargo que ancora o tema","source_anchor":"SITUACOES_TIPICAS","estimated_words":50,"title":"Imagine","subtitle":"Fim do bimestre, três turmas, e a sensação de correr sem avançar.","narration":"Imagine o fim do bimestre. Três turmas, mil tarefas, a agenda lotada. Você corre o dia inteiro e mesmo assim sente que não avançou no que importa. Essa sensação tem nome — e tem saída."}
```

**Quando usar:** ao menos uma vez quando houver contexto de cargo.

---

## 8. `maturity_ladder` — onde está × nível-meta

Cena densa. Mostra uma progressão de **níveis de maturidade** e destaca o nível-meta — o construto-núcleo da Vertho (régua N1→N4) virado cena. **Difere de `steps_flow`:** passos são ações de um método; degraus são **estados** de maturidade.

**Campos visuais:** `title` + `rungs` (**3 a 5**, cada 2–4 palavras, do mais básico ao mais maduro, em ordem) + `target` (índice 0-based do degrau-meta a destacar).

**Render** (`MaturityLadderV2.tsx`): escada ascendente esquerda→direita; cada degrau é uma barra conectada por trilho. O degrau `target` acende em ciano com micro-rótulo "META". Degraus entram em sequência.

```json
{"id":"scene-4","type":"maturity_ladder","key_idea":"Sair de corrigir para desenvolver é subir de nível","source_anchor":"PRINCIPIOS:Régua de maturidade","estimated_words":50,"title":"De corrigir a desenvolver","rungs":["aponta o erro","explica a correção","faz perguntar","forma autonomia"],"target":2,"narration":"Dar feedback tem níveis. No começo, a gente só aponta. Depois, explica. O salto vem quando você passa a fazer a pessoa pensar. A meta não é corrigir melhor — é criar quem se corrige sozinho."}
```

**Quando usar:** quando houver régua, níveis de proficiência ou transição de maturidade (N1→N4). Não adjacente a `steps_flow` (mesma família "progressão").

---

## 9. `myth_truth` — quebra de equívoco

Respiro de alto impacto. O mito esmaecido é riscado e dá lugar à verdade. **Difere de `comparison_motion`:** comparação contrasta duas práticas *válidas*; aqui um lado é o equívoco que se desfaz.

**Campos visuais:** `myth` (≤10 palavras, a crença errada) + `truth` (≤10 palavras, a correção).

**Render** (`MythTruthV2.tsx`): bloco superior — rótulo "MITO" + frase esmaecida **riscada** por uma linha que se desenha; bloco inferior — rótulo "VERDADE" em ciano + frase em ink cheio que assume a tela. Segue a convenção dos V2 (negativo = esmaecido; positivo = ciano), sem cor nova.

```json
{"id":"scene-7","type":"myth_truth","key_idea":"Corrigir não é a mesma coisa que desenvolver","source_anchor":"ERROS_COMUNS","estimated_words":38,"myth":"Basta apontar o erro.","truth":"Devolver a pergunta é o que ensina.","narration":"Existe uma crença comum: que corrigir já é desenvolver. Não é. Apontar o erro resolve a tarefa de hoje. Devolver a pergunta é o que ensina a pessoa a se virar amanhã."}
```

**Quando usar:** ao menos uma vez quando o módulo tiver `ERROS_COMUNS` / concepções equivocadas. **Máx. 1 por vídeo.** Não adjacente a `comparison_motion` (mesma família "contraste").

---

## 10. `definition_card` — termo + definição

Respiro. Define um termo de forma limpa, antes de aprofundá-lo — staple educativo, hoje espremido dentro do `concept_reveal`.

**Campos visuais:** `term` (1–3 palavras) + `definition` (≤14 palavras).

**Render** (`DefinitionCardV2.tsx`): card centralizado; rótulo "DEFINIÇÃO" em ciano, `term` grande em ink, hairline separando, `definition` abaixo esmaecida. Tela limpa.

```json
{"id":"scene-3","type":"definition_card","key_idea":"Definir feedback antes de ensinar a dar","source_anchor":"PRINCIPIOS:Feedback como instrução","estimated_words":34,"term":"Feedback","definition":"Informação acionável sobre onde se está e como avançar — não um veredito.","narration":"Antes de tudo, vale alinhar o que é feedback. Não é nota, não é elogio, não é bronca. É informação que mostra onde a pessoa está e o que fazer pra avançar."}
```

**Quando usar:** cedo no vídeo, para fixar um termo antes de aprofundar. **Máx. 1–2 por vídeo.**

---

## 11. `reflection_prompt` — pergunta no meio do vídeo

Respiro. Espelha o conceito na rotina do espectador com uma pergunta — reengaja no miolo de um vídeo de ~4 min. **Não substitui o `avatar_outro`** (que fecha com a pergunta acionável da semana); este é leve e provocativo, no meio.

**Campos visuais:** `prompt` (a pergunta, ≤14 palavras) + `tag` (opcional, ex.: "Pra pensar").

**Render** (`ReflectionPromptV2.tsx`): tela limpa; `tag` em ciano; `prompt` grande centralizado, com um pequeno motivo de sinal (pulso ciano). Entrada lenta, pausa longa.

```json
{"id":"scene-6","type":"reflection_prompt","key_idea":"Espelhar o conceito na rotina do espectador","source_anchor":"SITUACOES_TIPICAS","estimated_words":40,"tag":"Pra pensar","prompt":"Quando você devolveu a pergunta em vez da resposta?","narration":"Para um segundo e pensa na tua última semana. Quantas vezes alguém te trouxe um problema e você já entregou a solução pronta? Não tem certo nem errado aqui. Só repara no padrão."}
```

**Quando usar:** apenas no **terço central** do miolo — nunca como primeira ou última cena de miolo. **Máx. 1 por vídeo.**

---

## Regras de composição (impostas na normalização)

- `avatar_intro` é **sempre** a primeira cena; `avatar_outro` **sempre** a última (`normalizarRoteiro`, `roteiro-prompt.ts`).
- **Nunca** o mesmo template em duas cenas seguidas — e o reordenador (greedy) evita também a **mesma família visual** adjacente, preservando ao máximo a ordem da IA. Famílias: **decomposição** (`concept_reveal`, `icon_story`) · **contraste** (`comparison_motion`, `myth_truth`) · **progressão** (`steps_flow`, `maturity_ladder`) · **respiro** (`quote_spotlight`, `scenario_card`, `stat_highlight`, `definition_card`, `reflection_prompt`).
- **Intercale** cenas densas (`concept_reveal`, `comparison_motion`, `steps_flow`, `maturity_ladder`) com respiros (`quote_spotlight`, `scenario_card`, `icon_story`, `myth_truth`).
- Miolo: **6–8** cenas (módulo enxuto) · **8–10** (médio) · **10–12** (denso). Nunca mais de 12.

## Deck invariante (chave do reuso por DISC)

Template, ordem das cenas e **todos** os textos de tela (`title`, `subtitle`, `bullets`, `items`, `quote`, `stat`) são dirigidos **apenas** por densidade do conteúdo, cargo, PPP/instituição e transição de maturidade. O **perfil DISC ajusta SOMENTE a narração** — nunca o template, a ordem ou o texto de tela. Por isso o mesmo deck visual é reaproveitado por todos os perfis (`deck_invariant: true`, `disc_sensitive_fields: ["narration"]`).
