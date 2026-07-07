---
name: competency-matrix
description: Metodologia para criar/editar matrizes de competência, réguas de maturidade (descritores N1-N4) e ao onboardar um novo segmento no Mentor IA. Carregue ao mexer nos prompts de autoria (IA2/gabarito) ou nas competências/descritores de um cargo.
---

# Matrizes de competência (metodologia)

> **Fonte da verdade = o código, não esta skill.** A geração real roda pela IA (fase1: IA1 seleciona Top-N; IA2 gera o gabarito) e as réguas ficam na tabela `competencias`. Esta skill é o **como pensar**; ao editar, alinhe ao schema real abaixo.

## Framework Vertho (real)

- **Top-N competências por cargo**, NÃO um número fixo. O **IA1 seleciona** as mais relevantes e grava em **`top10_cargos`** (até 10, validado por humano) — mas **varia** (ex.: o demo comercial usa 5/cargo). Nunca assuma "exatamente 12".
- Cada competência tem **descritores**, cada descritor tem **4 níveis** (N1→N4).
- **Ética** é camada transversal de valores (Alinhado / Tensão / Violação), **não** uma competência selecionável. Avaliada por cenário.

### Os 4 níveis (colunas reais em `competencias`)

| Nível | Coluna | Significado |
|---|---|---|
| 1 | `n1_gap` | Lacuna — reativo, sem consistência |
| 2 | `n2_desenvolvimento` | Em desenvolvimento — com apoio / situações familiares |
| 3 | `n3_meta` | **META** — autonomia e consistência (nível esperado do cargo) |
| 4 | `n4_referencia` | Referência — excelência e multiplica para outros |

Progressão: reativo → intencional (1→2) → autônomo (2→3) → multiplicador (3→4). Cada nível deve ser distinguível pelo grau de **autonomia, consistência e impacto**.

### Fórmula do descritor comportamental

```
verbo + comportamento + contexto + resultado observável
```
✅ "Conduz reuniões pedagógicas semanais com pauta estruturada, garantindo registro de decisões e responsáveis"
❌ "Tem boa capacidade de liderança em reuniões" (sem verbo de ação, contexto ou resultado)

Os descritores de uma competência devem cobrir **facetas distintas** — não repetir a mesma ideia.

## CIS informa ESTILO, não NÍVEL

O perfil comportamental (DISC + valores + tipos psicológicos) **NÃO gera nota** de competência — em todos os prompts (IA4/scorer) vale "perfil NÃO altera a nota". Ele personaliza **cenário e tom do feedback**.
- **Errado**: "Alto D → nível 4 em Liderança".
- Certo: usar o CIS para adaptar o tom da devolutiva e o contexto do cenário.
- No banco, o DISC vira colunas `comp_*`/`lid_*` em `colaboradores` (é o que o motor de fit lê).

## Schema real (ao gravar)

`competencias`: `cod_comp`, `nome`, `cod_desc`, `nome_curto` / `descritor_completo`, `n1_gap`, `n2_desenvolvimento`, `n3_meta`, `n4_referencia`.
NÃO use `COMP_03` / `DESC_03_01` / `niveis:{1,2,3,4}` — não é o schema.

## Onboarding de um novo segmento

Ao criar competências para um segmento novo (pharma, agro, varejo):
1. Manter a fórmula do descritor + os 4 níveis (N1 lacuna → N4 referência).
2. Manter ética como valores e CIS como estilo.
3. Adaptar nomes de competências, settings dos descritores e vocabulário do setor.
4. Definir o nível esperado por cargo (relevância por papel).
5. Validar: **cada descritor precisa gerar um cenário situacional testável** (ver a skill `scenario-generation`).

## Checklist

- [ ] Competências vêm do Top-N do cargo (não um número mágico fixo)?
- [ ] Descritores cobrem facetas distintas (não redundantes)?
- [ ] 4 níveis com progressão clara (reativo → intencional → autônomo → multiplicador)?
- [ ] Fórmula aplicada (verbo + comportamento + contexto + resultado)?
- [ ] Nenhum descritor genérico ("tem boa capacidade de…")?
- [ ] Ética NÃO aparece como competência?
- [ ] N3 = META realista para o cargo?
- [ ] Gravado com as colunas reais (`cod_desc`, `n1_gap`…)?
