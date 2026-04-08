# Modelo de Fit v2 — Documentação Técnica

## Fórmula Master
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
