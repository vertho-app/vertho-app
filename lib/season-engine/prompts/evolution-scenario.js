/**
 * Semana 14 — cenário final que integra todos os descritores da temporada.
 * Após resposta, a IA pontua cada descritor de 1.0 a 4.0.
 */
export function promptEvolutionScenarioGen({ competencia, descritores, cargo, contexto }) {
  const system = `Você é um designer de casos para avaliação final de competências. Cria cenário REALISTA que força escolhas difíceis e integra múltiplos descritores.`;
  const user = `Crie o CENÁRIO FINAL de uma temporada de 14 semanas para avaliar TODOS os descritores abaixo integrados numa única situação.

CONTEXTO:
- Cargo: ${cargo}
- Setor: ${contexto}
- Competência: ${competencia}
- Descritores avaliados: ${descritores.map(d => d.descritor).join(', ')}

COMPLEXIDADE: COMPLETO
- 1 tensão central
- 1 fator complicador
- 1 dilema ético embutido
- 2 stakeholders nomeados com posições conflitantes

REGRAS:
1. Teste da resposta genérica: se "conversaria com todos e buscaria consenso" funciona, o cenário está fraco
2. Força escolhas reais
3. Todos os descritores devem ter relevância prática na situação

FORMATO MARKDOWN:

## [Título impactante]

**Contexto:** [3-4 linhas]

**Tensão central:** [1-2 linhas]

**Fator complicador:** [1-2 linhas]

**Dilema ético:** [1 linha]

**Stakeholders:**
- **[Nome]** ([papel]): [posição]
- **[Nome]** ([papel]): [posição]

**Como você conduziria esta situação, considerando TODOS os aspectos acima?**

Retorne APENAS o markdown do cenário.`;
  return { system, user };
}

/**
 * Avalia a resposta do colaborador, pontuando cada descritor.
 */
export function promptEvolutionScenarioScore({ competencia, descritores, cenario, resposta, nomeColab }) {
  const system = `Você é um avaliador rigoroso mas justo. Analise a resposta e atribua notas OBJETIVAS para cada descritor. Retorne APENAS JSON válido, sem markdown.`;
  const user = `COMPETÊNCIA: ${competencia}

CENÁRIO:
${cenario}

RESPOSTA DE ${nomeColab}:
"${resposta}"

DESCRITORES A AVALIAR:
${descritores.map(d => `- ${d.descritor} (nota inicial: ${d.nota_atual})`).join('\n')}

ESCALA:
1.0 = inicial (não demonstra o comportamento / demonstra oposto)
2.0 = em desenvolvimento (demonstra parcialmente, com lacunas evidentes)
3.0 = proficiente (demonstra consistentemente, com clareza)
4.0 = avançado (demonstra nuances, considera múltiplos ângulos, referência)

Retorne:
{
  "avaliacao_por_descritor": [
${descritores.map(d => `    { "descritor": "${d.descritor}", "nota_pre": ${d.nota_atual}, "nota_pos": 1.0-4.0, "justificativa": "1 frase citando trecho específico da resposta" }`).join(',\n')}
  ],
  "nota_media_pos": "média ponderada",
  "resumo_avaliacao": "1 parágrafo com devolutiva geral pra ${nomeColab}"
}`;
  return { system, user };
}
