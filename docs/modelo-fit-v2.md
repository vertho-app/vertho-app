# Modelo de Fit v2 — Documentação Técnica

> **ATUALIZAÇÃO 06/2026 — MOTOR ÚNICO (`lib/scoring`).** O Fit e o Relatório de
> Adequação ao Cargo agora compartilham UM motor determinístico (`lib/scoring/engine.ts`).
> O conteúdo abaixo (fórmula master, fator crítico/excesso) descreve a **rota LEGADA**,
> usada só como fallback quando o cargo NÃO tem `gabarito.tela4` ou tem `fit_perfil_ideal`
> customizado salvo. Para a esmagadora maioria (cargos com gabarito da IA2), vale o
> modelo novo a seguir.

## Motor único (rota primária)
- **Onde:** `lib/scoring/engine.ts` (`scoreCandidate`) + adaptadores `role-spec.ts`
  (gabarito→RoleSpec) e `candidate.ts` (colab→CandidateProfile). O `fit-v2-adapter.ts`
  (`calcularFitUnificado`) roda o motor e devolve o **contrato legado** do Fit v2 (fit_final,
  classificacao, blocos, gap_analysis, leitura_executiva) — `calcularFitIndividual` usa essa
  rota quando há `gabarito.tela4` e não há `fit_perfil_ideal` salvo.
- **Fit por traço CONTÍNUO** (não degraus) com **direção** `floor` (quanto mais melhor) /
  `target` (centro é o ideal) / `ceiling` (manter baixo). A IA2 emite `direcao` por traço;
  gabarito legado → `inferDirection` (fallback).
- **Beta = média dos blocos PONDERADA** por `pesos_blocos` (da IA, ou default líder/não-líder).
  Liderança é 1 traço `scalar` (distância vetorial). Cargo não-líder dropa o bloco e renormaliza.

### Régua versionada por `spec_version` (CONGELA histórico)
A régua de scoring (tolerância de rampa + cortes de cor) é **emitida por `role-spec.ts`
conforme `gabarito.spec_version`** — `reguaDe(specVersion)`. Versionar aqui garante que um
gabarito antigo NÃO muda de cor quando recalibramos a régua: só **geração nova** (`rodarIA2`
carimba `LATEST_SPEC_VERSION`) ou **promoção deliberada** (jsonb_set) pega a régua nova.

| Versão | Mapeamento | Rampa (`tol`) | Cortes verde/amarelo | Origem |
|--------|-----------|---------------|----------------------|--------|
| v1     | binário   | 20 | 0,85 / 0,60 | re-ancoragem do contínuo (26/06) |
| v2     | contínuo (cap peso 0,20) | 20 | 0,85 / 0,60 | 27/06 |
| v3     | = v2      | 20 | 0,85 / 0,60 | revisões clínicas por-gabarito (JSON, sem lógica nova) |
| **v4** | = v2      | **30** | **0,865 / 0,754** | **29/06 — régua re-ancorada (abaixo)** |

- **Rampa (`tol`)**: distância, fora da faixa, até o fit chegar a 0. `tol=20` zerava cedo
  demais — "moderadamente fora" virava fit 0, perdendo gradiente onde o corte encosta em
  gente real (3 achatamentos: Map-binário, Dominância 21-80, Conformidade). e-se multi-cargo
  provou que `tol=30` é uma **translação +~1,5** (Spearman 0,99, sem distorção de forma):
  recupera o gradiente sem reordenar. Em v4, `buildRoleSpec` seta `tLo/tHi=30` nos band traits.
- **Cortes de cor** (`spec.bandHigh`/`bandMid`, consumidos em `scoreCandidate`): como o motor
  contínuo é translação, **preservar significado = preservar proporção** → os cortes sobem
  junto (`0,85/0,60`→`0,865/0,754`, quantis medidos). `borderline` = a banda vira sob ±SEM.
  Os v<4 herdam 0,85/0,60 do fallback (`BAND_HIGH/BAND_MID`).

- **Eliminatórias (`knockouts`) = GATE, não penalizam o número.** Reprovar uma eliminatória
  → classificação **"Não recomendado"** + premissas ✗, e o colaborador vai pro **fim do
  ranking** (mesmo com match alto) e conta como crítica na distribuição. O número (Fit/Beta)
  é SEMPRE o match real — PDF e tela mostram o mesmo valor (1 casa decimal).
  - Knockout `scope:"trait"` usa o NOME da competência ("Persistência"); o `role-spec`
    resolve p/ `comp_*`/letra DISC e descarta o que não casa. Knockout sobre bloco/traço
    AUSENTE (ex.: liderança em cargo não-líder) é N/A → passa (nunca auto-reprova todos).
  - **GATE DESACOPLADO DA RÉGUA DE SCORE** (v4): o knockout é avaliado numa **tolerância de
    REFERÊNCIA fixa** (`DEF.tol=20`), NÃO na rampa de score da spec. Motivo: o gate é binário
    sobre o mín%, mas o valor medido é o FIT, e o fit é desenhado pela rampa — alargar a
    tolerância levanta o fit de quem está abaixo do piso e **afrouxa o corte eliminatório**
    (rampa 30 crua destravava 6 gates de Empatia em Ibipeba). Avaliar o gate em `DEF.tol` pina
    o corte onde o psicólogo o calibrou; só o SCORE ganha rampa. Em v<4 os dois fits coincidem
    (régua tol=20) → no-op. É o guardião `knockout_acoplado_piso` na alavanca da tolerância.
  - **Status DRIVER-AWARE** (v4): um VERDE com um band trait (competência/DISC) em déficit
    moderado+ (fit < `driverThreshold`, v4=0,65) é rebaixado p/ "com ressalvas" e entra no
    plano. O Beta (média ponderada) mascara furos locais (Beta 90 + Dominância 35%); sem isto
    selo×narrativa×plano contavam histórias diferentes. Leve (65-74) só menciona. `kind:'band'`
    já exclui Mapeamento/Liderança (domain-agnostic).
- **Fonte ÚNICA de cor/classificação = `result.status`** (tela E PDF). Antes a tela usava
  `classificar()`/`getFaixa()` com 85 hardcoded (≠ `spec.bandHigh`), divergindo na fronteira
  v4. Hoje `calcularFitUnificado` deriva classificação do status + persiste `status` no
  `resultado_json`; `loadRankingCargo` repassa; `app/admin/fit` colore por `viewDe(status)`.
- **Coluna "Premissas"** no ranking (`/admin/fit`): ✓ atendida / ✗ não, tooltip do motivo.
  ⚠️ Mudança de fórmula do `fit_final` exige **Recalcular (forçar)** — `fit_resultados` fica
  com o valor antigo até recalcular.

## Fórmula Master (LEGADO — fallback)
```
Fit Final = Score Base × Fator Crítico × Fator Excesso
Score Base = ∑ (Score_bloco[i] × Peso_bloco[i])
```

## 4 Blocos
| Bloco | Peso default | O que compara |
|-------|-------------|---------------|
| Mapeamento | 0.20 | Tags comportamentais reais vs ideais |
| Competências | 0.35 | 16 sub-competências CIS vs faixas ideais |
| Liderança | 0.20 | Estilos (Executor/Motivador/Metódico/Sistemático) |
| DISC | 0.25 | D, I, S, C vs faixas ideais |

## Scoring gradual (Competências e DISC)
- Dentro da faixa: 100
- Até 10 fora: 75
- 11-20 fora: 50
- 21-30 fora: 25
- >30 fora: 0

## Penalização Crítica
- 0 blocos abaixo do limiar: ×1.00
- 1 bloco: ×0.85
- 2 blocos: ×0.70
- Qualquer <30: ×0.55

## Penalização por Excesso
- Até 10 acima: 0
- 11-20: -5
- 21-30: -10
- >30: -15
- Fator limitado a [0.80, 1.00]

## Classificação
| Faixa | Score | Recomendação |
|-------|-------|-------------|
| Excelente | 85-100 | Aderente |
| Alta | 70-84 | Aderente com PDI leve |
| Razoável | 50-69 | Desenvolvimento |
| Baixa | 30-49 | Risco |
| Crítica | 0-29 | Não recomendado |

## Tabelas
- `cargos_empresa.fit_perfil_ideal` — Perfil ideal JSON
- `fit_resultados` — Resultados individuais

## Actions (actions/fit-v2.js)
- `salvarPerfilIdeal(cargoId, perfil)` — Salvar perfil ideal
- `calcularFitIndividual(empresaId, cargo, colabId)` — Fit individual
- `calcularFitLote(empresaId, cargo)` — Fit em lote
- `loadRankingCargo(empresaId, cargo)` — Ranking com percentil
- `loadFitIndividual(colabId)` — Buscar fit individual
- `loadCargosComFit(empresaId)` — Listar cargos com stats

## Engine (lib/fit-v2/)
- `engine.js` — Cálculo principal + adapters
- `blocos.js` — 4 blocos individuais
- `penalizacoes.js` — Fator crítico + excesso
- `classificacao.js` — Faixas + leitura executiva
- `gap-analysis.js` — Gaps, forças, alertas
- `ranking.js` — Ranking + percentil + distribuição
- `validacao.js` — Validação do perfil ideal JSON

## UI
- `/admin/fit?empresa=ID` — Dashboard de ranking por cargo
- Modal individual com blocos, gaps, forças, leitura executiva
