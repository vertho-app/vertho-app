# Gerador de Vídeo a partir de Módulo-Base

> Status: **IMPLEMENTADO e em produção.** Doc único do pipeline de vídeo.
>
> Em 27/07/2026 esta página absorveu `templates-video-miolo.md` (241 l) e teve o bloco **"Design
> histórico"** (~150 l) **removido**: ele descrevia voz Kore, 5 cenas e $0,20/vídeo — nada disso
> corresponde ao sistema atual, e o próprio texto se declarava defasado. Documento que mente sobre o
> presente atrapalha mais do que a ausência dele; o conteúdo segue no git.

## Estado atual (implementado · jun/2026)

**Gatilho:** botão “Gerar vídeo” no Módulo-Base (`/admin/vertho/modulos-base/[id]`)
→ `actions/gerar-video.ts::criarEDispararVideo` → task `trigger/gerar-video-modulo`.

**Pipeline (na task `gerar-video-modulo`):**
1. **Roteiro** — modelo da task `conteudo_video` (`lib/ai-tasks.ts`; **`claude-opus-5` desde 05/08/2026**), pela **Batch API** via `submitClaudeBatch` (`lib/ai-batch.ts`, −50%), com fallback síncrono por `callAI` quando `VIDEO_ROTEIRO_MODE=sync` ou `forceSync` (o Kit). Estrutura flexível: `avatar_intro` + miolo 6–12 cenas (13 templates) + `avatar_outro`. O `avatar_intro` **NÃO cumprimenta** (a saudação nominal faz isso — ver abaixo).
   - ⚠️ **Não peça `thinking` no corpo.** Até 10/08 este passo montava request cru com
     `thinking:{type:'enabled',budget_tokens}` — formato removido na geração 5 — e o pipeline ficou
     **5 dias gerando zero vídeo** sem deixar rastro. Na geração 5 o raciocínio já vem ligado e
     divide `max_tokens` (16k aqui) com o texto. Modo de falha completo: `docs/FMEA-PIPELINE.md` §F-I14.
2. **Narração** — Gemini TTS, voz **`Aoede`** (`VIDEO_TTS_VOICE`; até 05/09/2026 era Vindemiatrix no modelo 3.1), 1 mp3/cena, com **direção de estilo por tipo de cena** (intro calorosa/engajante, miolo conversa, outro pausado) + correção de pronúncia de siglas. Whisper alinha palavra-a-palavra (legendas).
3. **Avatar (HeyGen)** — só nas pontas; lip-sync do NOSSO mp3 (`audio_url`), 1920×1080; mp4 normalizado p/ CFR (25→30fps). **API v3 desde 25/09/2026**, motor `avatar_iii` explícito: contrato, preços e método de medição na seção "Integração HeyGen v3" abaixo.
4. **Render (Remotion, comp `VerthoVideo`)** — recebe tudo via `inputProps` (timeline de `montar-inputprops.ts`). **Dois backends** (`RENDER_BACKEND`):
   - **`hetzner`** (default/produção): enfileira `render_queued`; a box **CCX33 efêmera** (`worker-hetzner/worker.mjs`, modelo PULL) renderiza. **~$0,18/vídeo**, sobe/deleta por lote.
   - **`trigger`** (override de teste): render em chunks paralelos no trigger.dev. **~$5-6/vídeo em 1080p** (~42min). Snap de scale p/ dims inteiras (`Math.round(h*scale)/h`) corrige o bug do 0.6667.
   - Default **1080p** (`VIDEO_RENDER_SCALE` ausente → scale 1); 720p = 0.6667.
5. **SFX por template** — pacote sonoro (tick/count-up/chime/etc.) embutido na composição (`VideoCompositionV3`), volumes calibrados, gatilho casado com a fala (Whisper). **Sem transição de slides** entre cenas (cortes secos — `fadeInOut` desligado; só a abertura/fechamento do vídeo inteiro tem fade via `FilmFade`).
6. **Masterização de áudio** (`masterizar-audio.mjs`, ffmpeg, pós-render) — **trilha (bed)** com berço acústico + **ducking sidechain** (a trilha recua sob voz/SFX) + **master −14 LUFS / −1 dBTP** (loudnorm 2-pass). Roda no worker E no trigger (`masterizarSeguro`, degrada p/ áudio cru se o bed faltar).
7. **Upload** → Bunny Stream (lib 636615) → grava `videos_gerados` (status/etapa/urls/srt/vtt).

**Saudação nominal (Rota A — personalização por pessoa):** o deck é **genérico por célula** (módulo × empresa × cargo × DISC); o nome **não entra no render**. Após o deck, `personalizar.mjs` gera “Olá, {nome}. Que bom ter você aqui.” por colaborador da célula — TTS **Vindemiatrix** (mesma voz do avatar) **normalizado a −14 LUFS** (casa o volume do deck), cena `AvatarGreeting` (Remotion) + **crossfade curto** (0,3s) no deck. Tom alinhado ao avatar (nem festivo nem sereno demais). Grava em `videos_personalizados` (cache por célula×colaborador). `PERSONALIZE_LIMIT` (env, 0=todos) limita a quantidade (usado em testes). Roda tanto no worker (`personalizeCell`, via `pg`) quanto no trigger (`render-video.ts::personalizarCelula`, via PostgREST, reusando o mesmo `personalizar.mjs`).

**Entrega ao colaborador:** `resolverVideoDaSemana`/`resolverCelulaVideo` entregam o personalizado do colaborador se houver (`done`), senão o genérico da célula (fallback transparente).

Detalhes vivos em [[project_current_work]] (memória) e nos arquivos `lib/video/*`, `worker-hetzner/*`, `trigger/gerar-video-modulo.ts`, `trigger/render-video.ts`.

---

## Integração HeyGen v3 (desde 25/09/2026)

A HeyGen retira `/v2/video/generate` e `/v1/video_status.get` em **31/10/2026**. O cliente único
é `lib/video/heygen.ts`; o único chamador de produção é o passo 2 de `trigger/gerar-video-modulo.ts`
(os scripts `_conarh-video-espelho.ts` e `_render-local-completo.ts` usam as mesmas funções).

**Contrato** (medido com chamada real em 24/09/2026):

| | |
|---|---|
| Criar | `POST /v3/videos` `{type:'avatar', avatar_id, engine:{type:'avatar_iii'}, audio_url, resolution:'1080p', aspect_ratio:'16:9'}` → `data.video_id` |
| Consultar | `GET /v3/videos/{id}` → `data.status` (`completed` com `video_url` e `duration`; `failed`) |
| Saldo | `GET /v3/users/me` → `data.wallet.remaining_balance` (US$). É o MESMO saldo que a v2 mostrava em créditos (884 créditos ≈ US$ 14,73) |
| Foto | a foto de sempre (`d160ea51…`, `HEYGEN_TALKING_PHOTO_ID`) já é um look `photo_avatar` na v3, com o mesmo id |

- **`engine` é objeto.** Como string, a API devolve 400.
- **Sem `engine`, o v3 usa Avatar IV.** O motor vem de `HEYGEN_ENGINE` (default `avatar_iii`) e é
  lido na hora da chamada.
- **Erros HTTP no polling:** 5xx e 429 seguem esperando; os outros 4xx são fatais na hora (antes, um
  401 virava 20 minutos até o timeout). A mensagem `HeyGen timeout aguardando video_id` é lida como
  texto pelo health e pela FMEA: não mudar.
- **Retomada:** o `video_id` da HeyGen fica em `assets[cena].heygenVideoId`, persistido ANTES do
  polling. Um re-run depois de queda retoma o clipe já pago em vez de gerar outro.
- **Espera de ~40 min** (300 consultas de 8 s). Eram ~20, e em 25/09/2026 um clipe de 26 s ficou
  pronto em 22,4 min na fila da HeyGen: o timeout derrubou o vídeo com os dois clipes já pagos.

**Preço** (conferido por delta da carteira, mesmo áudio de 7,58s, clipes em série, 24/09/2026):

| Motor | Medido | Tabela oficial (16/09/2026) |
|---|---|---|
| v2 `talking_photo` (o que rodava) | US$ 0,0172/s | — |
| v3 `avatar_iii` foto | **US$ 0,0171/s** | Photo/Studio US$ 0,99/min = 0,0165/s |
| v3 `avatar_iv` foto (default da v3) | US$ 0,0382/s (2,2×) | não conferida |
| v3 `avatar_iii` Digital Twin | — | US$ 0,60/min = 0,0100/s (exige filmar pessoa real + consentimento) |

Com os **34-37s de avatar medidos por vídeo** (não os ~28s que o prompt mira), o avatar custa
**~US$ 0,56-0,61 por vídeo**. Desde a v3, **cada clipe concluído grava o custo no ledger**
(`ia_usage_log`, feature `heygen_avatar`, source `heygen:v3`, duração reportada pela HeyGen ×
`HEYGEN_USD_POR_SEGUNDO` do catálogo), e o relatório semanal avisa a semana em que essa camada entra.

**Conferência do ledger contra o saldo** (25/09/2026, 1ª célula real na v3: Macaé, Professor(a), C):
2 clipes, 13,17s + 11,10s. O saldo caiu US$ 0,41. A HeyGen cobra o **segundo exato**: arredondar
cada clipe para cima dava US$ 0,429 (+4,6%); o segundo exato a US$ 1,00/min dá US$ 0,405 (−1,3%).
Somando os dois testes (31,85s → US$ 0,54 ± 0,01), o preço real fica em 0,0166-0,0173/s, e o
catálogo usa US$ 1,00/min, o valor da fatura de junho. A tabela de 0,99/min fica logo abaixo.

**Método de medição** (use o mesmo ao testar outro motor ou foto): ler o saldo em `/v3/users/me`,
gerar UM clipe, esperar o saldo mudar, ler de novo. Um clipe por vez; o saldo tem precisão de
centavo, então use clipes de 7s ou mais. Rodar a v2 como controle confirmou o método.

---

## Avatar compartilhado por grupo (desde 25/09/2026, atrás de `VIDEO_AVATAR_GRUPO`)

**Por quê.** A célula de vídeo é (empresa × módulo × cargo × 1ª letra do DISC), e cada uma pagava
o seu avatar: ~US$ 0,59 de um vídeo de ~US$ 0,90. As 2-4 células DISC de um mesmo módulo e cargo
tinham abertura e fecho quase iguais. Com a flag ligada, elas dividem UM avatar. Economia derivada
do acervo de 24/09: −40 a −51% por módulo.

**Fluxo** (só no caminho do Kit, `gerarKitSemanal`, com cargo definido):

1. **Textos, 1× por grupo** (`lib/video/avatar-grupo-core.ts` `prepararGrupoAvatar`), ANTES do
   fan-out dos DISC, junto com o brief e o PPP. Uma chamada curta ao modelo da tarefa
   `video_avatar_grupo` (Opus 5, o mesmo do roteiro) escreve a abertura e o fecho em tom NEUTRO,
   sem DISC. A régua (`problemasDosTextosAvatar`): abertura 28-36 palavras e sem cumprimento (a
   saudação com o nome entra antes), fecho 24-32 palavras terminando em pergunta, tela curta. Duas
   tentativas; recusado, segue sem grupo.
2. **Roteiro de cada DISC com o avatar fixo** (`roteiro-prompt.ts` `avatarFixo`): o modelo copia a
   abertura e o fecho, conta as palavras deles no orçamento de 440-540, e o tom DISC vale só no miolo.
   O desafio do Kit, que o fecho conduzia, passa para a última cena do miolo. Depois do parse,
   `aplicarAvatarFixo` IMPÕE o texto. Sem `avatarFixo` o prompt é byte a byte o de antes (snapshot).
3. **Células inseridas sem disparo** (`etapa = aguardando_avatar`, `avatar_grupo_id`).
4. **Orquestrador** (`trigger/gerar-video-grupo.ts`): gera a 1ª célula pela ordem D, I, S, C (a
   mãe) com `triggerAndWait`, grava o avatar dela no grupo e dispara as irmãs com ele. A mãe serve
   de referência com as duas cenas de avatar prontas e a F0 medida no áudio delas. Narração única
   NÃO é condição desde 25/09/2026: no piloto ela foi recusada nas 3 células, e exigi-la fazia o
   grupo quase nunca pegar. A mãe que saiu pelo caminho por cena tem a costura de sempre; as irmãs
   herdam a mesma.
5. **Irmã** (`gerar-video-modulo`, payload `avatarGrupo`): as cenas de avatar chegam prontas (mp4 da
   mãe, mp3, timing). O miolo é narrado pelo MESMO caminho da mãe: take único (com o portão julgando
   a altura contra a F0 do avatar da mãe, `alvo`) se a mãe saiu em take único; cena a cena se ela saiu
   cena a cena. O passo da HeyGen pula sozinho.
6. **Emenda** (desde 26/09/2026): depois de narrar, a irmã confere o miolo contra a régua do avatar
   que a mãe mediu (`referencia`: caminho, nível da fala em dBFS, ritmo em palavras por segundo).
   Ritmo fora de ±15% = sai do grupo e refaz tudo como hoje. Dentro, cada cena do miolo é levada ao
   nível do avatar (até ±9 dB, sem clipar).

**Por que a emenda mede ritmo e nível, e não só altura** (`Medido 26/09/2026`, escuta cega do dono,
grupo Gerente Comercial do ACME Demo): a irmã com o MENOR salto de altura foi a pior, porque o miolo
dela saiu num take único 23% mais rápido e 5 dB mais baixo que o avatar, que a mãe narrou cena a cena.
A irmã que narrou o miolo pelo mesmo caminho da mãe (ritmo 1,04×, 2 dB) foi a melhor, acima da própria
mãe. O take único sai ~20-25% mais rápido que as sínteses por cena com direção de abertura e fecho.

**Tabela** `video_avatar_grupo` (mig 270): `chave` única = hash de empresa, módulo, cargo, contexto
do cargo e do PPP e `VERSAO_AVATAR_GRUPO`. Status `pendente` → `pronto` | `erro` (fonte:
`AVATAR_GRUPO` em `lib/status.ts`). Grupo `pronto` não muda; uma nova rodada reabre só grupo em `erro`.

**Quando a irmã NÃO usa o avatar da mãe** (e paga o próprio, com `video-avatar-grupo-fallback`
registrado): assinatura diferente (voz, modelo TTS, versão do elenco, direção, foto, motor, fps);
texto de avatar diferente do grupo; portão recusando o miolo contra a altura da mãe em todas as
tentativas. Falha de Whisper ou de corte NÃO tira a irmã do grupo (aconteceria sem ele também): o
miolo cai no caminho por cena.

**Ledger:** o take do miolo da irmã grava `tts_video_cena` com `artifactKey` `…:take-grupo:…`
(julgado contra a mãe, não contra o alvo do elenco). Ao calibrar o portão, separe as duas populações.

**⚠️ Não apague `video-assets/{maeId}/`**: as irmãs apontam para os arquivos da mãe.

**Para ligar:** aplicar a mig 270, deploy do Trigger, `VIDEO_AVATAR_GRUPO=on` no env do Trigger.
Piloto recomendado: tenant de demo, 1 módulo × 3 DISC, conferindo no saldo da HeyGen UM par de
clipes, o salto de F0 no corte e a leitura cega dos 3 vídeos.

---

## Templates de cena (13)

> Fonte canônica dos campos:
> `lib/video/roteiro-prompt.ts` (`MIOLO_TIPOS`); renderização em
> `video-spike/remotion/VideoCompositionV3.tsx` (switch `renderSceneVisual`) + `scenes/`.

Todo vídeo é **`avatar_intro` → miolo (6-12 cenas) → `avatar_outro`**. Avatar **só nas pontas**; o
miolo é 100% animação Remotion com voice-over — sem filmagem, câmera ou imagem gerada por IA.

**Campos comuns de toda cena de miolo:** `id` (`scene-N`, re-sequenciado na normalização) · `type` ·
`key_idea` · `source_anchor` (de onde a ideia saiu: `PRINCIPIOS:<nome>`, `ERROS_COMUNS`,
`BOAS_PRATICAS`, `SITUACOES_TIPICAS`, `CARGO`, `PPP`…) · `estimated_words` (45-65 por cena de miolo)
· `narration` (**fonte canônica do TTS e das legendas**; fala oral, frases ≤20 palavras).

| Template | Peso | Para que serve |
|---|---|---|
| `avatar_intro` | ponta | Abre o tema e prende (26-30 palavras, ~15s). **Não cita o descritor no gancho** — prende primeiro, nomeia depois |
| `avatar_outro` | ponta | Fecha com **pergunta de reflexão acionável** na rotina do cargo (22-26 palavras, ~14s) |
| `concept_reveal` | densa | Conceito ou distinção em 3 pontos |
| `comparison_motion` | densa | Prática fraca × desejada, lado a lado |
| `steps_flow` | densa | Método/rotina em passos numerados |
| `maturity_ladder` | densa | Progressão de **níveis de maturidade** com o nível-meta destacado (a régua N1→N4 virada cena). Difere de `steps_flow`: passos são ações; degraus são **estados** |
| `icon_story` | respiro | 3 sinais/exemplos/comportamentos em ícones grandes |
| `stat_highlight` | respiro | Um único número em destaque |
| `quote_spotlight` | respiro | Frase-âncora em tela limpa |
| `scenario_card` | respiro | Situação reconhecível do dia a dia |
| `myth_truth` | respiro | Mito riscado dá lugar à verdade. Difere de `comparison_motion`: lá as duas práticas são válidas; aqui um lado é o equívoco |
| `definition_card` | respiro | Termo + definição, antes de aprofundar |
| `reflection_prompt` | respiro | Pergunta no **meio** do vídeo para reengajar. Não substitui o `avatar_outro` |

**Regras impostas na normalização** (`normalizarRoteiro`): `avatar_intro` sempre primeira e
`avatar_outro` sempre última; **nunca o mesmo template em cenas seguidas** — e o reordenador greedy
evita também a mesma **família visual** adjacente (decomposição · contraste · progressão · respiro),
preservando ao máximo a ordem da IA; intercalar densa com respiro; miolo de **6-8** cenas (módulo
enxuto), **8-10** (médio), **10-12** (denso), nunca mais de 12.

**Deck invariante — é o que permite reusar por perfil:** template, ordem e **todos** os textos de
tela são dirigidos só por densidade do conteúdo, cargo, PPP e transição de maturidade. O **DISC
ajusta SOMENTE a narração** (`deck_invariant: true`, `disc_sensitive_fields: ["narration"]`). Por
isso o mesmo deck serve todos os perfis da célula, e só o áudio muda.

> O **texto literal do prompt** que gera o roteiro fica em `PROMPT-ROTEIRO-VIDEO.md` (mantido
> separado de propósito: é o artefato, não a documentação dele). Resumo no `CATALOGO-PROMPTS-IA.md` §11.8.

---

## Atualização 25/06/2026 — duração, cache de saudação e infra

**Duração calibrada (3,5–4,5 min).** Vídeos saíam ~5,6 min. `lib/video/roteiro-prompt.ts` recalibrado com a **taxa real medida ~125 palavras/min** (não ~90): alvo **~490 palavras / ~4 min**, miolo **6–8 cenas**, 58–66 palavras/cena, faixa 440–540. (1ª tentativa com ~390 palavras saiu 3,0–3,6 min = baixo demais.) Sem hard-cap pós-TTS — recalibrar medindo `palavras ÷ (totalFrames/30/60)`.

**Cache de saudação (escala).** `worker-hetzner/personalizar.mjs`: a saudação ("Olá, {nome}" = TTS Vertex + render Remotion `AvatarGreeting`) era refeita por (usuário × célula). Agora o `greetMp4` é gravado **1× no storage** (`video-assets/greetings-cache/{colab}__{voz}__{nome}__{WxH}.mp4`) e **reutilizado** em todas as células — pula TTS (rate-limited) + render; só o crossfade com o deck permanece por vídeo. Chave determinística (sem tabela). Escala: O(usuários × materiais) → O(usuários). Ver `docs/ESCALA-50K.md`.

**Infra de render.**
- `RENDER_SERVER_TYPE=cx43` (era cx33; ~2× + folga de RAM). CX só existe em hel1/nbg1 (Europa).
- Watchdog `MAX_RENDER_MS` default 25→**40min** (`worker.mjs`): 25min matava render válido (um de 5,6min levou 32min em cx33). Override por env.
- TTS resiliente (`lib/gemini-tts.ts`): re-tenta quando o Vertex responde **200 OK sem áudio** (intermitente) — antes 1 cena com hiccup derrubava o vídeo ("TTS: resposta sem áudio").
- Snapshot atual: `401652957` (rebuildar quando `worker-hetzner/*` mudar → atualizar `RENDER_SNAPSHOT_ID` no trigger).

---

## Atualização 28/07/2026 — primeiro lote grande medido (42 células)

Gerar o vídeo de uma semana inteira do Ibipeba (semana 5) deu o primeiro número real de
throughput e de taxa de falha do pipeline em lote.

**Medido:**

| | |
|---|---|
| Células | **42** `(modulo_base × cargo × 1ª letra do DISC)` → **42/42** `done` com `bunny_video_id` |
| Tempo | **~91 min** o lote (disparo `--conc 4` + renders em paralelo); **22 min** um render isolado |
| Boxes | escalaram sozinhas até **15** (`MAX_RENDER_BOXES`), ladder cx43 → cx33 → cpx32 conforme estoque; **todas morreram** no idle shutdown (conferido por API: 0 ativas) |
| Personalizados | **187** `videos_personalizados` nominais saíram atrás dos decks, sem intervenção |
| Custo | **47 renders pagos para 42 células** (~12% de desperdício) ≈ $33 |
| Custo por vídeo (medido 06/09/2026) | HeyGen ≈ US$ 0,47 (2 clipes, ~28 s) + TTS take único 0,05-0,09 (2.5 Flash) + Whisper e box ≈ 0,04 → **≈ US$ 0,56-0,60**; detalhe em `docs/CUSTO-QUALIDADE.md` §07/09. ⚠️ Corrigido em 24/09: o avatar real tem 34-37s, não 28s → HeyGen ≈ US$ 0,59 e vídeo ≈ US$ 0,90 (ver "Integração HeyGen v3") |

**🔴 A taxa de falha do lote é de SATURAÇÃO de fornecedor, não de bug — 6 de 41 (~15%):**
3× `TTS: resposta sem áudio após 4 tentativas` e 3× `HeyGen timeout aguardando video_id`.
Concorrência 4 basta para saturar Vertex TTS e HeyGen ao mesmo tempo. **Recuperação é trivial e
foi 100%:** re-rodar o mesmo disparo com `--conc 2`. A célula em `error` não conta como "tem deck"
(o resolver da entrega filtra `status<>'error'`) e a UNIQUE parcial permite a linha nova — então
re-disparar é seguro e idempotente.

**Receita que funcionou, na ordem que importa:**
1. **Piloto de UMA célula antes do lote.** Valida roteiro → HeyGen → Remotion → Bunny por ~$0,70
   em vez de descobrir um caminho quebrado depois de gastar ~$29.
2. Lote com `--conc 4`; **re-disparo dos falhos com `--conc 2`**.
3. **Conferir boxes pela API do Hetzner no fim** — box viva é dinheiro parado.

⚠️ **O combo tem de ancorar no `modulo_base` do CORE**, a mesma âncora que `resolverVideoDaSemana`
usa na leitura. Ancorar noutro lugar (no módulo do brief do kit, por exemplo) rende vídeo que
renderiza, custa e **não aparece** — é o vídeo órfão de `KIT-SEMANAL.md`.

⚠️ **O token do Hetzner no `.env.local` tem nome COM ESPAÇOS** (`Hetzner Cloud api token`), e os
scripts fazem o fallback `HCLOUD_TOKEN ||` esse nome. Um check de infra que lê só `HCLOUD_TOKEN`
autentica vazio e a API responde `unauthorized` — se o script imprimir apenas `servers.length`,
isso vira **"0 boxes"** e leva a diagnosticar "fila parada" com 9 boxes rodando (aconteceu em
28/07). Check de infra imprime o erro da API antes da contagem.
