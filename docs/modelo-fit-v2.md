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
- **Cortes de cor (RE-ANCORADOS p/ o contínuo):** verde ≥ **0,85**, amarelo **0,60–0,84**,
  vermelho < 0,60. (Os antigos 0,75/0,50 eram do motor binário; o crédito parcial subia a
  distribuição ~10-13pp.) `borderline` = a banda vira sob ±SEM.
- **Eliminatórias (`knockouts`) = GATE, não penalizam o número.** Reprovar uma eliminatória
  → classificação **"Não recomendado"** + premissas ✗, e o colaborador vai pro **fim do
  ranking** (mesmo com match alto) e conta como crítica na distribuição. O número (Fit/Beta)
  é SEMPRE o match real — PDF e tela mostram o mesmo valor (1 casa decimal).
  - Knockout `scope:"trait"` usa o NOME da competência ("Persistência"); o `role-spec`
    resolve p/ `comp_*`/letra DISC e descarta o que não casa. Knockout sobre bloco/traço
    AUSENTE (ex.: liderança em cargo não-líder) é N/A → passa (nunca auto-reprova todos).
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
