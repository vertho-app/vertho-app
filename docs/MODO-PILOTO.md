# Modo Piloto (descontinuado) e Modo Personalizado

> ⛔ **03/10/2026: o Piloto não é mais oferecido** ("não temos mais degustação de jornada",
> decisão do dono). Saiu da tela de escolha (aba Programa, override em Configurações → Equipe,
> turma no admin-v2) e o servidor recusa gravação NOVA dele (`MODOS_OFERECIDOS` em
> `programa-config.ts`, aplicado por `problemaNaChaveDePrograma`, `atualizarProgramaModo` e as
> actions de turma). O motor segue servindo quem já está nele: trilhas carimbadas `piloto`, o
> override de colaborador gravado e o `sys_config` de empresa gravado (`elo`). O E2E
> "E2E Piloto (fluxos críticos)" não tem relação com este modo: o nome é do piloto da suíte E2E.
> As seções sobre o Piloto abaixo descrevem a maquinaria que continua no motor.
> O **Personalizado** (última seção) virou programa completo de duração ajustável na mesma data.

# Modo Piloto: degustação de 2 semanas

> **Não é produto novo — só config.** `programa_modo = 'piloto'` na mesma engine de trilha
> (ver `ARQUITETURA.md §17`). Objetivo: o lead roda o **fluxo inteiro** (diagnóstico completo →
> conteúdo personalizado → fechamento com cenário + avaliação IA) em 2 semanas.
> O piloto **NÃO demonstra evolução na competência** — demonstra o método.

Implementado em 02/07/2026 (`28e831e` → `d48012d`). E2E completo validado em produção
(tenant ACME, 1 colaborador com override individual).

**Endurecimento 06–07/07/2026** (sprint pós-drift): a acumulada migrou pro Trigger.dev com
gate no fechamento (M8, ver seção própria); mais uma leva de robustez — fallback do Cenário B
(B1), `maxDuration=300` nas rotas (B3), report tolerante a N−1 descritores (B4), authz interna
por tenant (B5), prontidão batchada (B6), `isPilotoContentWeek` config-only (B7), sanitizer de
duração que pega qualquer 3–14 semanas (B8, era só 10–14), gate espelhado + self-heal fail-safe
(N1/N2) — e testes de integração B1/B2/B4/B5 (73 verdes, `7a6ef4e7`). Commits: `ce30c46d` ·
`e19acc04` · `76de153e` · `1d1279eb` · `83c8092a`.

## Estrutura

| | |
|---|---|
| Duração | 2 semanas de conteúdo + fechamento |
| Competências | 1 (âncora pela resolução existente: competência explícita → trilha → cargo) |
| Conteúdos | 4 — 2/semana, cada um sobre **1 descritor distinto** (top-4 por gap decrescente, `selectDescriptorsPiloto`, núcleo de ordenação compartilhado com o single) |
| Resolução de conteúdo | A **existente** (`montarSemanaConteudo`: formato-core por preferência×taxa + opcionais no switch). Zero IA na geração |
| Missões | Nenhuma |
| Diagnóstico | Completo e **inalterado** (DISC, mapeamento, DNA, Fit v2) |
| Fechamento | Completo: Cenário B (`banco_cenarios`, cargo) + scorer + check 2ª IA + Evolution Report |

### O plano tem 3 entradas ("2 semanas" de calendário)

```
sem 1  conteudo   2 entregas (conteudos_dia, shape do DUO — mesma comp, descritores distintos)
sem 2  conteudo   2 entregas · ao concluir: acumulada single-comp dispara (task Trigger.dev)
sem 3  avaliacao  FECHAMENTO — calendario_semana=2 (espelho): libera no CALENDÁRIO da
                  sem 2 (dia 7); o gate real é progressão ("sem 2 concluída"). Nunca espera dia 14.
```

O espelho vive em `ProgramaConfig.semanaEspelhoCalendario` ({3:2}) **e** gravado no próprio
plano (`calendario_semana` no slot de avaliação — snapshot é o contrato da UI/rotas).
`semanaAcumulada=2` é só o **endereço de persistência** do acumulado (não há semana de
conversa qualitativa no piloto — branch guard na rota `/evaluation`).

## Acumulada em background + gate do fechamento (M8)

A avaliação **acumulada** (single-comp, gerada ao concluir a sem 2) saiu do `after()` frágil e
passou a rodar numa **task Trigger.dev** `acumulada-piloto` (`trigger/acumulada-piloto.ts`,
retry 3, `maxDuration 600`), com status rastreável. Colunas em `temporada_semana_progresso`
(mig **169**): `acumulada_status` (`processing`|`done`|`error`), `acumulada_erro`,
`acumulada_started_at`.

- **Disparo** (`/reflection`, ao concluir a sem 2): marca `processing` e chama `tasks.trigger`
  (era `after()`).
- **Gate no fechamento** (`/evaluation`, `action:'init'`): `gateAcumuladaPiloto` (helper puro em
  `trilha-runtime.ts`) — se a acumulada não está `done`, devolve **202 `{processando}`** em vez de
  pontuar. Espelhado no início de `finalizarComScorer` (**N1**), pra nunca pontuar sem a acumulada
  mesmo por caminho alternativo (cenário já persistido de antes do gate, chamada direta send/arguir).
- **UI**: `sem14` mostra "preparando avaliação…" e faz **polling** via `action:'status'` até liberar.
- **Self-heal** inline: se a acumulada travou/errou (> 5 min sem `done`), a rota re-dispara — via
  `after()` no ambiente da Vercel. Carimba um claim; **N2** (fail-safe): o self-heal pula se já
  ficou `done` (Trigger ou outra req) ou se outra requisição re-claimou depois — no pior caso roda
  2×, nunca prende.
- **Fallback**: se o Trigger estiver indisponível (ex.: task não deployada), a acumulada roda inline
  via `after()` e marca o status — seguro publicar em qualquer ordem; o caminho Trigger fica latente
  até o **deploy MANUAL do trigger** (versões `20260706.1`/`.2`).

Elimina a race **B2** (scorer sem acumulado) e a fragilidade do `after()` (**R1**). E2E ao vivo
PASS em prod (a task executou; gate + self-heal validados). Commits `1d1279eb` · `83c8092a`.

## Trava de piso (piloto-only)

`lib/season-engine/piloto-trava.ts` (função pura, testada). Aplicada **só** no branch piloto
do scorer em `/api/temporada/evaluation`:

- `nota_pos` exibida = `max(bruto, baseline)` por descritor
- `nota_pos_bruto` + `piso_aplicado` **preservados no snapshot** (nunca mutação silenciosa)
- `nota_media_pos_bruto` preservada; média exibida recalculada
- `spec_version = 'piloto-v1'` carimbado — um pós de piloto é **inconfundível** com pós real

## Arguição — defesa oral (LIGADA no piloto)

O piloto foi o **testbed** da arguição (2º instrumento do fechamento): `PROGRAMA_PILOTO.arguicao =
{ativa:true, maxTurnos:4}` em `programa-config.ts`. Depois de validado, foi ligado em **todos os
modos**: Regular DUO/single (maxTurnos 8) e Onboarding (6). Como o runtime resolve a config pela
**constante de código** (o carimbo é só o rótulo `programa_modo`), ligar no código vale pra todas
as trilhas do modo — sem migração.

- Depois das 4 perguntas do Cenário B, a IA abre uma **defesa oral** por até 4 turnos (`arguicao.ts`),
  sonda a resposta e, ao encerrar, extrai evidências por descritor (`sustentou×forca`).
- A conversa **modula a nota** via `fusao-arguicao.ts` (mapa determinístico ±0,5, no CÓDIGO) **antes**
  da trava de piso — ordem: scorer → fusão → trava. A trava incide sobre a nota já fundida.
- UI: `sem14` troca do formulário para modo CHAT turn-by-turn; reconstrói no reload.
- PII: histórico persistido CRU; mascara só em-voo. Detalhes em `CATALOGO-PROMPTS-IA.md` §6.14.
  **R5 (revisto 07/07)**: cru é **by-design** — o colab reabre o histórico; a fronteira sensível (o
  payload da IA, mascarado em `arguicao.ts::histParaIA`) já é protegida; mascarar em repouso seria
  inconsistente com reflexão/respostas, também cruas. Arguição **mantida ligada** no piloto (decisão
  de produto, B9).
- Validado E2E em prod 03/07 (ACME/rdnaves, trilha `3d3f303a`): abertura → 3 turnos → conclusão →
  scorer+fusão+trava. O E2E expôs 2 bugs latentes (campo `turn` no payload da IA; dedup de descritor
  duplicado na fusão) — ambos corrigidos.

## Relatório sem delta

`gerarEvolutionReport` detecta o modo (carimbo da trilha) e produz o shape piloto:
`{modo:'piloto', descritores:[{baseline, nota_avaliacao, nota_avaliacao_bruta, piso_aplicado}]}` —
**sem** convergência/antes→depois. Tela `/dashboard/temporada/concluida` e PDF têm variante
piloto: competência = ponto de partida, fechamento = "demonstração da avaliação".
A agregação do gestor (`loadEvolutionReportsEmpresa`) **exclui** relatórios piloto.
Os prompts do scorer/check recebem `semanaFinal`/`semanasEvidencia` da config (regular = 14/13,
byte-idêntico) + `notaPrograma` no piloto (a devolutiva não fala em "14 semanas").
Se o scorer avaliou **N−1 descritores** (algum sem resposta), o report **não trava mais** (B4):
gera com o que há e sinaliza `incompleto` + `descritores_avaliados`/`descritores_esperados` pro
admin regerar (mantidos os guards de `spec_version` e avaliação-vazia).

## Como ativar

O modo resolve por **precedência de geração**. A fonte é `resolverModoDaTurma`
(`lib/turmas/config-efetiva.ts`), chamada por `lib/season-engine/trilha-core.ts` com a config
efetiva da turma; `resolverModoColab` é o caso sem turma e dá o mesmo resultado. A ordem
(conferida em 03/10/2026, R-131; antes esta lista não tinha turma):

1. `turma_membros.config_override.programa_modo` (exceção da participação)
2. `turmas.sys_config.programa_modo` (a turma da pessoa, no admin-v2)
3. `colaboradores.programa_modo` (override individual legado, Configurações → Equipe)
4. `empresas.sys_config.programa_modo` (default do tenant, Configurações → Programa)
5. ausente → Jornada (`PROGRAMA_MODO_PADRAO`, desde 03/10/2026; antes era o Regular DUO). A
   trilha legada SEM carimbo segue no DUO (`getProgramaConfigLegado`): ela nasceu nele.

Exceção: a 2ª competência de um Personalizado em andamento entra como `custom` sem passar por
essa ordem, porque o encadeamento entrega a config congelada da trilha que concluiu
(`configPersonalizado` em `trilha-core.ts`, vindo de `encadear-jornada.ts`).

Desde 03/10/2026 só `jornada`, `onboarding` e `custom` aceitam gravação nova. `piloto`,
`regular_duo`, `regular_single` (e a grafia antiga `regular`) seguem lidos; a tela mostra o valor
gravado como "descontinuado" e não o troca sozinha ao salvar outra aba (`salvarConfig` valida só
o que mudou).

O rótulo resolvido é **carimbado** em `trilhas.programa_modo` na geração; o runtime
(reflexão/fechamento/acumulada/report) lê **do carimbo** — trocar o modo da empresa não
afeta trilha em andamento. Rótulos (`ProgramaModoLabel`): `jornada` | `regular_duo` |
`regular_single` | `onboarding` | `piloto` | `custom`.
Migrations: **153** (COMMENT sys_config) e **154** (colunas + COMMENTs).

Fluxo de conversão (histórico, enquanto o Piloto era oferecido): colaborador marcado `piloto` →
roda a degustação → cliente fecha → troca o override (ou o default) → regerar a temporada. Hoje a
trilha de piloto concluída não é regerada por cima (`travaRegeracao`, `trilha_concluida`): a
próxima precisa nascer como trilha nova.

## Prontidão (antes de liberar)

Botão **"Prontidão piloto"** em `/admin/temporadas?empresa=...` (`verificarProntidaoPiloto`,
com `descriptor_assessments` batchado por colab — B6, sem N+1), por colaborador cujo modo
resolvido é piloto:

- ⛔ **Bloqueador**: descritor do top-4 sem NENHUM conteúdo utilizável (nem próprio, nem pool
  da competência) — a semana nasceria com fallback templated
- ⛔ **Bloqueador**: sem Cenário B pro cargo **nem genérico** (`cargo='todos'`,
  `tipo_cenario='cenario_b'`) — o fechamento retornaria 424. A rota `/evaluation` prioriza o
  cenário do cargo e **cai pro `'todos'`** quando não há do cargo (`escolherCenarioB`, B1; desde
  18/09 só serve B da competência da trilha, ver F-C14 no FMEA),
  alinhando com a prontidão (que já aceitava 'todos'). Gerar na Fase 4 do pipeline ("Cenários B + Check")
- ⚠️ Aviso: sem conteúdo próprio do descritor (reusa pool) ou formatos opcionais faltando
  (o switch degrada) — ok
- ⛔ Menos de 4 descritores avaliados distintos — completar o mapeamento

## Arquivos-chave

```
lib/season-engine/programa-config.ts       PROGRAMA_PILOTO · semanaCalendario · resolverModoColab · getProgramaConfigDaTrilha
lib/season-engine/select-descriptors.ts    selectDescriptorsPiloto (top-4 gap, 1 slot cada, sem doubling)
lib/season-engine/build-season.ts          branch isPilotoContentWeek (conteudos_dia por descritor) + calendario_semana
lib/season-engine/piloto-trava.ts          aplicarTravaPiloto + PILOTO_SPEC_VERSION
lib/season-engine/arguicao.ts              defesa oral: abrir/turno/extrair (+ PII em-voo) — LIGADA no piloto
lib/season-engine/fusao-arguicao.ts        fundirArguicao (mapa sustentou×forca → ±0,5 no código)
lib/season-engine/cenario-b.ts             escolherCenarioB (competência da trilha; cargo → 'todos', B1)
lib/season-engine/trilha-runtime.ts        gateAcumuladaPiloto (helper puro do gate da acumulada, M8/N1)
trigger/acumulada-piloto.ts                task Trigger.dev da acumulada (retry 3, status; deploy MANUAL)
actions/temporadas.ts                      gerarTemporadaPiloto · verificarProntidaoPiloto
app/api/temporada/evaluation/route.ts      fechamento sem 3 (espelho + gate acumulada M8/N1 + arguição + fusão + trava + report internal; maxDuration 300)
app/api/temporada/reflection/route.ts      dispara task Trigger.dev acumulada-piloto ao concluir sem 2 (M8: gate/self-heal no fechamento + fallback after; internal={empresaId})
app/dashboard/temporada/*                  timeline (espelho + rótulo Fechamento) · sem14 (sem delta + polling "preparando…") · concluida (variante piloto)
lib/temporada-concluida-pdf.ts             TemporadaPilotoPDF (sem delta)
tests/unit/piloto/*                        config · seleção · trava · buildSeason · gate-cenariob · report-tenant (integração B1/B2/B4/B5, 73 verdes) (+ regressão DUO)
migrations/153 + 154 + 169
```

## Lições do E2E (02/07/2026) — valem pra TODA a engine

O E2E do piloto expôs e corrigiu **4 bugs latentes do regular**:

1. **Triggers automáticos com sessão de colab**: `gerarAvaliacaoAcumulada` e
   `gerarEvolutionReport` exigem admin, mas os auto-triggers rodam na sessão do colaborador →
   FORBIDDEN/UNAUTHORIZED silencioso. Fix original: flag `internal=true` (só callers de servidor,
   após `assertColabAccess`). **B5 (06/07)**: `internal` deixou de ser `boolean` e virou
   `{empresaId}` — o caller passa o tenant da SESSÃO e a action rejeita trilha de outro
   tenant (defense-in-depth). **Fix definitivo (23/07)**: acumulada E evolution-report saíram
   da flag — núcleos headless em `lib/season-engine/avaliacao-acumulada-core.ts` e
   `lib/season-engine/evolution-report-core.ts` (recheck B5 via `opts.empresaId`), actions
   sempre gatadas, rotas/mapeamento importam os cores direto. A dívida da
   `use-server-internal-allowlist` ficou só nas 2 entradas do `actions/whatsapp.ts`.
2. **Fire-and-forget morre no freeze da Vercel**: `(async () => {...})()` solto é morto quando a
   lambda congela após o response. **Todo trabalho pós-response em rota DEVE usar `after()`**
   (next/server). Aplicado nos 4 triggers (piloto, sem 13, onboarding parcial, notify tutor; este saiu em
   22/09/2026 com o papel tutor).
   **Atualização M8 (06/07)**: o trigger da acumulada do PILOTO migrou de `after()` para uma
   task **Trigger.dev** (`acumulada-piloto`, retry+status) + gate/self-heal no fechamento, com
   `after()` só como fallback. Sem 13 / onboarding / notify seguem em `after()`.
3. **Multi-tenant**: `loadTemporadaConcluida` buscava colab com `.eq('email').maybeSingle()`
   direto — usuário em 2+ empresas → null. Usar sempre `findColabByEmail` (resolve o tenant).
4. **Prompts com régua hardcoded**: scorer/check falavam "14 semanas" para qualquer modo.

## Modo PERSONALIZADO: uma Jornada de duração ajustável (03/10/2026)

Decisão do dono em 03/10/2026: o Personalizado deixou de ser o builder de degustação
(22/07/2026, 1 a 4 semanas, competências em paralelo, regras do piloto) e virou **programa
completo**: uma Jornada com a duração escolhida.

**Os 3 inputs** (`sys_config.programa_custom`, MESMO formato de antes, validado por
`parseProgramaCustom` ao salvar e na geração):

| input | valores | sentido |
|---|---|---|
| `semanas` | 1 a 6 (`CUSTOM_LIMITES`) | semanas de CONTEÚDO **por competência**; cada semana é a da Jornada (2 conteúdos e 1 desafio) |
| `numCompetencias` | 1 ou 2 | competências **em sequência**, uma trilha cada |
| `fechamento` | sim ou não | vale para as duas competências |

Compatibilidade: o formato gravado não mudou, só o sentido de `semanas` com 2 competências (antes,
semanas em paralelo com uma pílula de cada). A única empresa em `custom` em 03/10 (unianchieta,
`{"semanas":1,"fechamento":false,"numCompetencias":1}`, 0 trilhas) tem 1 competência e mantém o
sentido. Não havia trilha `custom` no banco, então nenhum snapshot antigo precisou de leitura dupla.

**A config de UMA trilha** (`derivarConfigCustom`) é a `PROGRAMA_JORNADA` com a duração trocada
(6 semanas com fechamento é IGUAL à Jornada, e há teste disso):

- `modo: 'regular'`. Era `'piloto'`, e isso ligava trava de piso, spec `piloto-v1`, relatório sem
  nível e avanço e recusa do certificado. Agora nada disso vale para o Personalizado.
- 2 conteúdos por semana, um desafio por competência, sem semana de missão, **sem checkpoint do
  gestor** (como a Jornada, por desenho do produto em 04/09).
- Com fechamento: semanas = N+1, avaliação em N+1, acumulada em N, arguição de 6 turnos. O
  fechamento é uma semana própria do calendário, como a semana 7 da Jornada (sem o espelho de
  calendário da degustação).
- Sem fechamento: semanas = N, sem slot de avaliação, arguição desligada.
- `numCompetencias: 1` por trilha.

**A seleção de descritores** é a da Jornada, no MESMO caminho de código
(`gerarTemporadaCoreHeadless`): blueprint quando existe, senão `selectDescriptors(assessment,
slots)`, que distribui as semanas entre os descritores por lacuna. Não exige mais um descritor
distinto por pílula (o gerador antigo exigia semanas × 2 e falhava com
`piloto_descritores_insuficientes`; medido em 03/10, 646 de 739 pares pessoa e competência têm só
6 descritores, então o teto real era 3 semanas).

**2 competências em sequência: o mecanismo é o encadeamento da Jornada.** Cada competência é uma
trilha (`numero_temporada` 1 e 2), com fechamento, relatório e certificado próprios.

1. Na geração da 1ª trilha, `planejarTrilhaPersonalizada` (trilha-core) resolve as duas
   competências (`resolverCompetenciasDoPersonalizado`: âncora primeiro, depois foco do cargo,
   `sys_config.competencias_regular_duo`, top 10 do cargo) e exige o mapeamento das DUAS antes de
   gerar. Não dando, **falha alto** com erro acionável (`custom_segunda_competencia` ou
   `sem_assessment`) e nada é gravado. O gerador antigo rebaixava para 1 competência em silêncio.
2. O snapshot (`trilhas.programa_config`) leva a sequência: `sequenciaPersonalizado:
   { competencias: [A, B], posicao: 1 }`.
3. Ao concluir a 1ª, `encadearProximaJornada` (o mesmo da Jornada) lê o snapshot e gera a 2ª com
   `novaJornada: true` e `configPersonalizado` = o snapshot da 1ª com `posicao: 2`
   (`configDaProximaCompetencia`). As regras são as CONGELADAS na 1ª trilha, não as da tela no
   dia: o programa está em andamento. Terminada a 2ª, não há próxima.
4. Regerar a MESMA trilha preserva a posição dela (regerar a 2ª não a transforma na 1ª de uma
   sequência nova); a duração é re-derivada da tela, como sempre foi no custom regerado em custom.

Por que o encadeamento e não as duas competências numa trilha só: é o que a Jornada já faz em
produção (05/08), dá um fechamento, um relatório e um certificado por competência, e cada trilha
continua com UMA competência, que é o que as telas, o relatório por competência e o certificado
esperam. Entre a 1ª e a 2ª, a pessoa vê o que vê no fim de uma Jornada: a trilha concluída (com
relatório e certificado) e a próxima começando na segunda-feira seguinte (`nextMondayISO`, ou a
data da turma).

**Onde a trilha conclui:**

- Com fechamento: `gerarEvolutionReportCore` (o da Jornada): relatório com nível e avanço,
  `encadearAposConclusao` em seguida.
- Sem fechamento: a rota `/reflection`, ao concluir a última semana de conteúdo
  (`deveEncerrarSemFechamento`), grava `montarReportSemFechamento`: `modo: 'sem_fechamento'`,
  `sem_fechamento: true`, o ponto de partida (`baseline`) por descritor e NENHUMA nota de chegada.
  Sem Cenário B não há medição de chegada, e o relatório diz que o avanço não foi medido em vez de
  mostrar zero. Depois da resposta, `aposEncerramentoSemFechamento` relê a trilha e só encadeia se
  ela concluiu de fato (o `update` da rota é dívida declarada do guard E11 e não lê o `{ error }`;
  a releitura fecha o efeito). Se não concluiu, linha crítica `encerramento-sem-fechamento-falhou`.
- Quem agrega evolução (painel do colaborador, RH, gestor) deixa de fora o relatório sem
  fechamento pela mesma régua do piloto: `relatorioMedeEvolucao` (convergencia.ts).
- Tela de conclusão: variante própria (`noClosing`), com o nível de partida por competência, os
  momentos e o botão do certificado; o PDF da temporada responde 409 (não há avaliação para
  imprimir).

**Certificado:** emitido para o Personalizado com e sem fechamento (participação ≥ 75%), com a
carga de `cargaHorariaDoCertificado(config.semanas)`, a config lida do snapshot: 6 semanas com
fechamento = 24h (como a Jornada); 3 semanas sem fechamento = 10h; 1 semana = 3h. O Piloto
continua sem certificado (`isTrilhaPiloto`).

**Tela** (Configurações → Programa): semanas 1 a 6 ("por competência"), 1 ou 2 competências,
fechamento sim ou não, e a prévia do calendário de cada competência. Prontidão
(`verificarProntidaoPiloto`) usa a mesma seleção e resolve as duas competências.

**Arquivos:** `lib/season-engine/programa-custom.ts` (limites, derivação, sequência, relatório sem
fechamento) · `trilha-core.ts` (`planejarTrilhaPersonalizada`,
`resolverCompetenciasDoPersonalizado`) · `encadear-jornada.ts` (`encadearAposConclusao`, ramo
custom) · `encerramento-sem-fechamento.ts` · `trilha-runtime.ts` (snapshot-aware) ·
`programa-config.ts` (`getProgramaConfigDaTrilha` lê o snapshot do custom quando vem no select) ·
migração 182 · testes em `tests/unit/custom/` (validados por mutação).

**Efeitos que continuam valendo da versão de 22/07** (para todos os modos): o cron de envios para
no fim REAL do plano (`totalSemanasDoPlano`); a prontidão só exige Cenário B quando há fechamento.

⚠️ **Limite herdado da Jornada:** a cadência (`fase4_envios`) não reinicia sozinha na trilha
encadeada; ela segue o relógio da primeira e se encerra no fim dela. A segunda competência precisa
de reinscrição na cadência (Envios), como a segunda Jornada hoje.
