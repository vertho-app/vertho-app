---
name: scenario-generation
description: Metodologia para gerar/revisar cenários situacionais do Mentor IA (educacional e comercial). Carregue ao editar os prompts de cenário (IA3) ou ao revisar a qualidade dos cenários gerados.
---

# Cenários situacionais (metodologia)

> **Fonte da verdade = o prompt real.** A geração roda pela IA3 (`lib/season-engine/prompts/evolution-scenario.ts::promptEvolutionScenarioGen` e `actions/fase1.ts`), e os cenários ficam em `banco_cenarios`. Esta skill é o **como pensar** + as regras de qualidade; ao editar, alinhe ao prompt e ao schema abaixo.

Um cenário é uma situação **realista do dia-a-dia do cargo** que força uma decisão sob pressão. A resposta revela o nível de maturidade na competência avaliada.

## Regras estruturais (as do prompt real da IA3)

- **1 tensão central** — o dilema que o cenário existe para avaliar, ligado aos descritores da competência.
- **1 fator complicador** — o que dificulta (tempo curto, recurso escasso, alguém que resiste, dado que contradiz). **UM só**, não acumular.
- **1 dilema ético embutido** (no cenário completo/fechamento).
- **Máx 2 stakeholders nomeados**. Só o que **cria a tensão** ganha nome; o resto por papel ("a coordenadora", "uma família", "a Secretaria"). Nunca 4 nomes sem centro.
- **Teste dos 10s**: lendo só o contexto, o problema central tem que ficar claro em <10 segundos. Se precisa de mais, tem informação demais.

### Tamanho e estilo
- Contexto ~200 chars; perguntas ~180 chars cada.
- Ação direta em vez de descrição ("Tatiana contesta o dado na frente de todos", não "Na hora em que…").
- **Aberturas variadas**: no máx ~1/3 dos cenários de uma escola/empresa começam com "Você está…"; alternar com "É segunda-feira…", "Ao abrir o e-mail…", começo direto pelo evento.

## Onde os cenários entram (estrutura real)

- Os cenários de **conteúdo/aplicação** saem por (cargo × competência × descritor) durante a trilha, com complexidade crescente.
- O **fechamento** usa um **Cenário B** (`banco_cenarios.tipo_cenario = 'cenario_b'`) que **integra os descritores** da competência — é a base da avaliação final por triangulação.
- Modos da trilha: **Regular DUO (14 sem)**, **Onboarding (10)**, **Piloto (2 + fechamento)**. O fechamento é na **semana 14** (regular) / **espelho** no piloto — **não existe "semana 15-16"**.

### Cenário B (fechamento)
Testa os MESMOS descritores com **contexto diferente** (o colaborador não reconhece, mas é avaliado nos mesmos critérios). Mesma complexidade do original; trocar setting/personagens/fato gerador, manter competência + descritores.

## Schema real de saída (`banco_cenarios`)

```json
{
  "titulo": "O Dado que Divide",
  "cargo": "Coordenador",
  "competencia_id": "<uuid da competencia>",
  "tipo_cenario": "cenario_b",
  "descricao": "Reunião pedagógica, 40 min. Você apresenta dados de avaliação externa: 22% dos alunos abaixo do esperado em leitura. Tatiana, professora veterana, contesta o dado na frente da equipe.",
  "alternativas": {
    "perguntas": [
      {
        "numero": 1,
        "texto": "Tatiana contesta na frente de todos. Você valida e abre o debate, ou mantém o foco nos 22%? O que faz primeiro e o que perde ao escolher?",
        "descritores_primarios": [1, 2],
        "o_que_diferencia_niveis": "N1 evita o conflito; N3 acolhe a objeção sem perder a pauta; N4 transforma a tensão em decisão coletiva."
      }
    ]
  }
}
```
NÃO use `COMP_03` / `DESC_03_01` — os campos reais são os acima (a régua por pergunta é `o_que_diferencia_niveis` + `descritores_primarios`).

## Contextos por segmento
- **Educação** (Diretor, Coordenador, Professor): reunião pedagógica, conselho de classe, atendimento a família, sala de aula, Secretaria. Refs: PPP da escola, avaliações externas, inclusão, LGPD de menores.
- **Comercial** (na prática: Representante Comercial, Gerente Comercial, e cargos de apoio como Financeiro/Operações): visita a cliente, pipeline, negociação de preço, onboarding, forecast. Refs: CRM, metas, margem, concorrência.

## Checklist
- [ ] Máx 2 nomes próprios (só quem cria a tensão)?
- [ ] 1 tensão central clara em <10s?
- [ ] 1 complicador (não 3)?
- [ ] Contexto < ~200 chars; perguntas < ~180 chars?
- [ ] Abertura variada (não "Você está…")?
- [ ] Os descritores da competência são efetivamente testados?
- [ ] Gravado no schema real (`descricao`/`alternativas.perguntas[]` com `descritores_primarios` + `o_que_diferencia_niveis`)?
- [ ] Realista para o cargo e o contexto (PPP/segmento)?
