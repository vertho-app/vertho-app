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
1. **Roteiro** — `claude-opus-4-6` + extended thinking (task `conteudo_video`). Estrutura flexível: `avatar_intro` + miolo 6–12 cenas (13 templates) + `avatar_outro`. O `avatar_intro` **NÃO cumprimenta** (a saudação nominal faz isso — ver abaixo).
2. **Narração** — Gemini TTS, voz **`Vindemiatrix`** (`VIDEO_TTS_VOICE`), 1 mp3/cena, com **direção de estilo por tipo de cena** (intro calorosa/engajante, miolo conversa, outro pausado) + correção de pronúncia de siglas. Whisper alinha palavra-a-palavra (legendas).
3. **Avatar (HeyGen)** — só nas pontas; lip-sync do NOSSO mp3 (`voice.type=audio`), 1920×1080; mp4 normalizado p/ CFR (25→30fps).
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
