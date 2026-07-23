# Modo Piloto — degustação de 2 semanas

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

O modo resolve por **precedência de geração** (fonte única: `resolverModoColab`):

1. `colaboradores.programa_modo` (override individual — Configurações → Equipe, select por pessoa)
2. `empresas.sys_config.programa_modo` (default do tenant — Configurações → Programa)
3. ausente → Regular DUO

O rótulo resolvido é **carimbado** em `trilhas.programa_modo` na geração; o runtime
(reflexão/fechamento/acumulada/report) lê **do carimbo** — trocar o modo da empresa não
afeta trilha em andamento. Rótulos: `regular_duo` | `regular_single` | `onboarding` | `piloto`.
Migrations: **153** (COMMENT sys_config) e **154** (colunas + COMMENTs).

Fluxo típico de conversão: colaborador marcado `piloto` → roda a degustação → cliente fecha →
troca o override (ou o default) → **regerar a temporada** (sobrescreve o plano na mesma trilha;
o diagnóstico é reaproveitado, não se refaz).

## Prontidão (antes de liberar)

Botão **"Prontidão piloto"** em `/admin/temporadas?empresa=...` (`verificarProntidaoPiloto`,
com `descriptor_assessments` batchado por colab — B6, sem N+1), por colaborador cujo modo
resolvido é piloto:

- ⛔ **Bloqueador**: descritor do top-4 sem NENHUM conteúdo utilizável (nem próprio, nem pool
  da competência) — a semana nasceria com fallback templated
- ⛔ **Bloqueador**: sem Cenário B pro cargo **nem genérico** (`cargo='todos'`,
  `tipo_cenario='cenario_b'`) — o fechamento retornaria 424. A rota `/evaluation` prioriza o
  cenário do cargo e **cai pro `'todos'`** quando não há do cargo (`buscarCenarioBComFallback`, B1),
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
lib/season-engine/cenario-b.ts             buscarCenarioBComFallback (cargo → 'todos', B1)
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
   (next/server). Aplicado nos 4 triggers (piloto, sem 13, onboarding parcial, notify tutor).
   **Atualização M8 (06/07)**: o trigger da acumulada do PILOTO migrou de `after()` para uma
   task **Trigger.dev** (`acumulada-piloto`, retry+status) + gate/self-heal no fechamento, com
   `after()` só como fallback. Sem 13 / onboarding / notify seguem em `after()`.
3. **Multi-tenant**: `loadTemporadaConcluida` buscava colab com `.eq('email').maybeSingle()`
   direto — usuário em 2+ empresas → null. Usar sempre `findColabByEmail` (resolve o tenant).
4. **Prompts com régua hardcoded**: scorer/check falavam "14 semanas" para qualquer modo.

## Modo PERSONALIZADO — builder de degustação (22/07/2026)

O que era preset virou **dado**: a tela Configurações → Programa ganhou o card
**Personalizado**, que deriva uma degustação sob medida de 3 inputs —
`{semanas: 1–4, numCompetencias: 1–2, fechamento: S/N}` — sem deploy por demanda
nova (motivação: demo UniAnchieta, 3 pessoas, 1 semana, sem avaliação final).

**Arquitetura (as 3 decisões que importam):**

1. **Snapshot congela a config** (mig 182): a geração deriva a `ProgramaConfig`
   completa (`derivarConfigCustom`) e grava em `trilhas.programa_config`;
   `resolverConfigDaTrilha` lê o snapshot com precedência MÁXIMA. Editar o
   builder NÃO afeta trilha em andamento — mesma invariante do carimbo (154).
   Presets seguem sem snapshot (config pela constante; "ligar flag no código
   vale pro modo inteiro" preservado).
2. **Config derivada, não campos livres**: a família é a degustação (sem
   missões; mapeamentos DISC+técnico sempre ativos). A config derivada usa
   `modo:'piloto'` internamente — herda seleção top-N por gap, entrega dupla,
   e (com fechamento) acumulada + espelho + trava + arguição(4). O rótulo
   carimbado é `custom`.
3. **Sem fechamento** (`semanasAvaliacao: []`): a trilha CONCLUI ao concluir a
   última semana de conteúdo (rota `/reflection`, `deveEncerrarSemFechamento` +
   `montarReportDegustacao` — report modo piloto com `sem_fechamento:true`,
   spec `degustacao-v1`, baseline sem notas). Tela de conclusão reusa a
   variante piloto (PDF oculto); agregação do gestor já exclui.

**2 competências**: 2ª comp pela MESMA prioridade do DUO (foco do cargo →
sys_config → top10, âncora 1º); top-(semanas) POR comp, 1 entrega de cada por
semana (segunda=A, terça=B). Sem 2ª comp viável/avaliada → degrada pra 1 (não
bloqueia). Prontidão verifica a âncora e avisa.

**Efeitos colaterais pagos junto (valem pra todos os modos):**
- Cron de envios agora pára no fim REAL do plano (`totalSemanasDoPlano`,
  espelho-aware) — antes avançava cego até 14 nudgeando semanas inexistentes.
- Prontidão é config-driven: Cenário B só é exigido quando o modo TEM fechamento.
- Sanitizer de duração (`sanitizarNarrativaPiloto`) e `notaPrograma` do scorer
  parametrizados por `slotsConteudo.length` (piloto=2 byte-igual).

**Arquivos:** `lib/season-engine/programa-custom.ts` (derivação + parse +
encerramento + report) · `trilha-core.ts` (`gerarTemporadaCustom`) ·
`trilha-runtime.ts` (snapshot-aware + `totalSemanasDoPlano`) · migração 182 ·
`tests/unit/custom/programa-custom.test.ts` (25 testes, validados por mutação).
