---
name: scenario-generation
description: Metodologia para gerar e revisar os cenários situacionais do mapeamento (Cenário A, IA3) e do fechamento (Cenário B). Carregue ao editar os prompts de cenário ou ao revisar a qualidade dos cenários gerados.
---

# Cenários situacionais (metodologia)

> **Fonte da verdade = o código.** Cenário A: `lib/ia3-cenarios.ts` (prompts v1 `buildIA3SystemPrompt` e `buildIA3UserPrompt`, auditor `buildCheckIA3SystemPrompt`) e `lib/ia3-cenarios-v2.ts` (regras v2). Cenário B: `lib/cenarios-b-prompt.ts`. Os cenários ficam em `banco_cenarios`. Esta skill é o como pensar; números e frases valem o que está no prompt, e os goldens em `tests/unit/ia3/` congelam o texto.

Um cenário é uma situação do dia a dia do cargo que força uma decisão. A resposta revela o nível de maturidade na competência, e a pessoa precisa RECONHECER a situação como parte do trabalho dela.

## O que aprendemos (09 a 13/10/2026)

- A queixa "situações fictícias" (Amazon Bowling, 09/10) vinha do INSUMO, não do tamanho. Sem situação real, o gerador inventava fato técnico (um sensor que não existe) e papel (o supervisor de manutenção negociando com o cliente). Ibipeba, com 11 PPPs reais, tem os textos mais longos e a melhor nota.
- A nota de representatividade (1 a 10, que a pessoa dá depois de cada cenário) é o sinal do cliente. Aparece na aba Cenários da Fase 1 e na regra R22 do health. Leia por PESSOAS, não por respostas, e lembre do efeito de ordem (o primeiro cenário recebe nota mais alta).

## Regras v2 (opt-in por empresa: `sys_config.cenarios_v2 = true`)

- **Uma situação, um problema central.** O complicador só entra se nascer da própria situação; nada de cadeia de coincidências.
- **Fato técnico só com fonte.** Equipamento, peça, sistema, procedimento, regra de fornecedor e números da operação vêm da ficha do cargo, das fronteiras, do caso real ou do contexto da empresa. Sem fonte, termo genérico ("a peça", "o sistema"). Detalhe de situação (horário, prazo, número de pessoas) pode ser criado, se for plausível.
- **Casos reais e fronteiras do gestor** (mig 286; planilha de cargos com "Fronteiras" e os pares "Competência N" + "Caso real N", ou o formulário de cargo).
  - As fronteiras (o que o cargo não faz) entram na ficha.
  - Cada caso é gravado com a competência para a qual foi escrito, e a competência parte do caso DELA (pelo nome). O caso fica gravado no cenário (`alternativas.caso_real`) para o auditor.
  - Sem caso próprio, o cenário usa um caso geral do cargo (se houver) ou sai do genérico da ficha. Nunca reaproveita o caso de outra competência.
- **Papel do cargo.** Nada de atribuição ou autoridade fora da ficha. Quem não está em Stakeholders não fala direto com o avaliado. O que o cargo pede a terceiros aparece como acionar ou coordenar.
- **Cliente em cargo sem cliente externo:** trabalhe o cliente interno ou o impacto que chega por quem atende o cliente.
- **Lugar.** Segunda pessoa, no local de trabalho da pessoa, sem nomear nem inventar instituição. Personagens com nomes próprios fictícios, no máximo 2 nomeados.
- **Perguntas.** Quatro, abertas, com UM pedido cada; 1 ou 2 descritores por pergunta, e as quatro juntas cobrem todos.
- **Tetos em código:** contexto até 900 caracteres e pergunta até 200 (`LIMITES_V2`). O alvo de tamanho sai da leitura cega do dono, não de analogia.
- **Auditor v2:** lista `fatos_sem_fonte`, `detalhes_sem_fonte`, `fora_do_cargo` e `repeticoes`. Erro grave (teto 60) só para fato técnico central sem fonte ou papel fora do cargo; detalhe de situação nunca é erro grave.

A v1, para empresa sem a chave, segue com o prompt de sempre: decisão forçada, faceta, trade-off, dilema ético, sobriedade (2 stakeholders, 2 tensões, contexto até 900 e pergunta até 200 caracteres) e anonimização das instituições.

## Versões, regeneração e o que nunca se reescreve

- Toda linha carrega `alertas_check.versao_prompt` (`ia3-p1` ou `ia3-p2`), e o check grava `versao_regua`. O check usa a régua DA LINHA: um cenário v1 já entregue não é rechecado pela v2.
- Regenerar um A respondido (resposta ou conversa do assessment) cria LINHA NOVA, já auditada, e a respondida fica intacta: a IA4 avalia o texto que a pessoa leu.
- Só a versão mais nova da célula (competência, cargo e PPP) se regenera (`lib/cenario-versoes.ts`). A respondida aparece na Fase 1 como "substituído por versão mais nova".
- O Cenário B já servido (fechamento ou reavaliação) não se regenera. O gerador do A nunca reescreve nem apaga um B.

## Onde os cenários entram

- **Mapeamento (Cenário A):** um por competência do Top 5 do cargo, e um por PPP numa rede. Respondido no formulário ou no chat do assessment.
- **Fechamento (Cenário B, `tipo_cenario = 'cenario_b'`):** a mesma competência e os mesmos descritores, com situação-gatilho estruturalmente diferente; um por célula (índice único). A duração da trilha e a semana do fechamento se leem em `lib/season-engine/programa-config.ts` e `duracaoDaTrilha`. O que roda em produção é a Jornada de 7 semanas.

## Schema gravado (`banco_cenarios`)

- **A:** `titulo`, `descricao` (o contexto) e `alternativas.perguntas[]` com `numero`, `texto`, `descritores_primarios`, `o_que_diferencia_niveis` e `objetivo_diagnostico`, mais `faceta_testada_principal`, `tradeoff_testado` e `mapa_cobertura_descritores`.
- **B:** `titulo`, `descricao` e `alternativas.p1` a `p4` (o texto das perguntas), com `objetivo_diagnostico`, `faceta_avaliada` e `diferenca_estrutural_vs_cenario_a`.
- Não use `COMP_03` / `DESC_03_01`: os campos reais são estes.

## Checklist de revisão

- [ ] O problema central fica claro em 10 segundos?
- [ ] Todo fato técnico tem fonte na ficha, ou é genérico?
- [ ] O cargo só faz o que a ficha diz? Quem fala com o avaliado está em Stakeholders?
- [ ] Cada pergunta faz UM pedido?
- [ ] No máximo 2 nomes próprios, e nenhum nome de instituição?
- [ ] Todos os descritores estão cobertos?
- [ ] Repete evento ou número de outro cenário do mesmo cargo?
- [ ] Se já foi respondido, a mudança vira versão nova, nunca reescrita?
