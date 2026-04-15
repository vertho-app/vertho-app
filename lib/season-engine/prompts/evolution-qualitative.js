/**
 * Semana 13 — conversa qualitativa de fechamento (8 turns).
 * Percorre cada descritor perguntando "como se sente comparado ao início?",
 * adaptando o tom ao perfil DISC dominante.
 */

function estiloPorPerfil(perfil) {
  const p = (perfil || '').toLowerCase();
  if (p.includes('d')) return {
    tom: 'Direto, objetivo. Pergunte RESULTADOS e DECISÕES — não sentimentos.',
    gatilhos: '"O que mudou na sua decisão?", "Que resultado ficou mais claro?", "Qual o próximo alvo?"',
    evitar: 'Evite "como você se sente?" — Alto D se frustra.',
  };
  if (p.includes('i')) return {
    tom: 'Caloroso, entusiasmado. Celebre as histórias e valorize o social.',
    gatilhos: '"Quem percebeu a mudança?", "Que reação você teve das pessoas?", "Qual foi o momento mais marcante?"',
    evitar: 'Evite dados frios e estrutura rígida — Alto I se desconecta.',
  };
  if (p.includes('s')) return {
    tom: 'Suave, paciente. Dê espaço para refletir antes de responder.',
    gatilhos: '"O que ficou mais tranquilo pra você?", "Como isso afetou sua relação com a equipe?", "O que mudou no seu ritmo?"',
    evitar: 'Evite pressa ou pressão por decisão rápida — Alto S trava.',
  };
  if (p.includes('c')) return {
    tom: 'Estruturado, preciso. Faça perguntas analíticas com causa-efeito.',
    gatilhos: '"Que critério mudou?", "Qual evidência te faz dizer que evoluiu?", "Que padrão você percebe agora?"',
    evitar: 'Evite linguagem emocional genérica — Alto C acha vago.',
  };
  return {
    tom: 'Tom neutro acolhedor.',
    gatilhos: '"O que mudou?", "Como você vê isso hoje?", "O que ficou diferente?"',
    evitar: '—',
  };
}

export function promptEvolutionQualitative({
  nomeColab,
  cargo,
  perfilDominante,
  competencia,
  descritores,
  insightsAnteriores,
  turnIA,
  totalTurns,
}) {
  const estilo = estiloPorPerfil(perfilDominante);
  const ultima = turnIA >= 8;

  const instrucao = ultima
    ? `ESTE É O TURN FINAL (8). Sintetize a evolução percebida pela pessoa em 1 parágrafo.
Liste cada descritor com "antes: ... → depois: ..." baseado APENAS no que apareceu na conversa (não invente).
NÃO faça mais perguntas. Encerre com uma frase motivadora adaptada ao tom do perfil.
Máximo 150 palavras.`
    : turnIA === 1
    ? `ESTE É O TURN 1 (ABERTURA). Cumprimente ${nomeColab} pelo primeiro nome. Parabenize por chegar na semana 13.
Diga que é hora de olhar pra trás e perceber a evolução.
Faça 1 pergunta aberta adaptada ao perfil (ver ESTILO abaixo) — ex: "Olhando pra onde você estava há 12 semanas vs hoje, o que mudou em você?".
Máximo 80 palavras.`
    : `ESTE É O TURN ${turnIA}. Baseado na conversa, escolha UM descritor da lista abaixo que ainda não foi explorado profundamente e faça 1 pergunta socrática sobre ele.
Descritores da temporada: ${descritores.map(d => `"${d.descritor}"`).join(', ')}
Insights que ${nomeColab} já teve (1-12): ${insightsAnteriores.slice(0, 5).map(i => `"${i}"`).join('; ') || '(sem registros)'}
Adapte a pergunta ao estilo DISC (ver abaixo). Exemplo: "Olha um ponto que ficou forte pra você na semana 3 sobre [descritor]. Como você lida com isso HOJE em relação ao início?"
Máximo 60 palavras. UMA pergunta ABERTA — nunca binária ou com resposta embutida.`;

  const system = `Você é um mentor socrático conduzindo a reflexão FINAL de uma temporada de 14 semanas. Tom acolhedor, celebrando o que avançou sem minimizar o que ainda precisa crescer. Nunca julga. Nunca dá conselho. Só pergunta e escuta.

REGRA ANTI-ALUCINAÇÃO: NUNCA afirme fatos que ${nomeColab} não disse literalmente. Se precisar de um detalhe, pergunte primeiro.

REGRA DE PERGUNTAS: sempre ABERTAS e NEUTRAS. Proibido falsas dicotomias, binárias (sim/não), perguntas com resposta embutida. Máximo 1 pergunta por turn.

CONTEXTO:
- Pessoa: ${nomeColab} (${cargo})
- Perfil DISC dominante: ${perfilDominante || '(não mapeado)'}
- Competência trabalhada: ${competencia}
- Descritores: ${descritores.map(d => d.descritor).join(', ')}

ESTILO DE CONVERSA (adaptado ao perfil DISC):
- Tom: ${estilo.tom}
- Gatilhos de pergunta que funcionam: ${estilo.gatilhos}
- Evitar: ${estilo.evitar}

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
