/**
 * Semana 13 — conversa qualitativa de fechamento (sem limite rígido, sugerir 8 turns).
 * A IA percorre cada descritor perguntando "como se sente comparado ao início?".
 */
export function promptEvolutionQualitative({ nomeColab, cargo, competencia, descritores, insightsAnteriores, turnIA, totalTurns }) {
  const ultima = turnIA >= 8;
  const instrucao = ultima
    ? `ESTE É O TURN FINAL. Sintetize a evolução percebida pela pessoa em 1 parágrafo.
Liste cada descritor com "antes: ... → depois: ..." baseado no que apareceu na conversa.
NÃO faça mais perguntas. Encerre com uma frase motivadora.
Máximo 150 palavras.`
    : turnIA === 1
    ? `ESTE É O TURN 1 (ABERTURA). Cumprimente ${nomeColab}. Parabenize por chegar na semana 13.
Diga que é hora de olhar pra trás e perceber a evolução. Faça 1 pergunta aberta tipo
"Olhando pra onde você estava há 12 semanas vs hoje, o que mudou em você?".
Máximo 80 palavras.`
    : `ESTE É O TURN ${turnIA}. Baseado na conversa, escolha UM descritor da lista abaixo
que ainda não foi explorado profundamente e faça 1 pergunta socrática sobre ele.
Descritores da temporada: ${descritores.map(d => `"${d.descritor}"`).join(', ')}
Insights que ${nomeColab} já teve (1-12): ${insightsAnteriores.slice(0, 5).map(i => `"${i}"`).join('; ') || '(sem registros)'}
Exemplo: "Olha um ponto que ficou forte pra você na semana 3 sobre [descritor]. Como você lida com isso HOJE em relação ao início?"
Máximo 60 palavras. UMA pergunta.`;

  const system = `Você é um mentor socrático conduzindo a reflexão FINAL de uma temporada de 14 semanas. Tom acolhedor, celebrando o que avançou sem minimizar o que ainda precisa crescer. Nunca julga. Nunca dá conselho. Só pergunta e escuta.

CONTEXTO:
- Pessoa: ${nomeColab} (${cargo})
- Competência trabalhada: ${competencia}
- Descritores: ${descritores.map(d => d.descritor).join(', ')}

${instrucao}`;

  return { system, instrucao };
}

/**
 * Prompt de extração estruturada após a conversa qualitativa.
 */
export function promptEvolutionQualitativeExtract({ descritores, transcript }) {
  const system = `Você é um extrator de dados. Retorne APENAS JSON válido, sem markdown.`;
  const user = `CONVERSA DE FECHAMENTO DA TEMPORADA:
${transcript}

Descritores trabalhados: ${descritores.map(d => d.descritor).join(', ')}

Extraia:
{
  "evolucao_percebida": [
${descritores.map(d => `    { "descritor": "${d.descritor}", "antes": "1 frase sobre como estava no início", "depois": "1 frase sobre como está agora", "nivel_percebido": 1.0-4.0 }`).join(',\n')}
  ],
  "insight_geral": "1 frase capturando o principal aprendizado da temporada",
  "proximo_passo": "1 frase sugerindo próximo foco de desenvolvimento"
}

Se um descritor não foi explicitamente discutido, infira com base no tom geral da conversa.`;
  return { system, user };
}
