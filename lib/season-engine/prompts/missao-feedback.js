/**
 * Feedback analítico sobre o relato de execução da Missão Prática
 * (sems 4/8/12 quando modo='pratica'). Ancora 100% na evidência real
 * que o colab trouxe, não em cenário fictício.
 *
 * 10 turns da IA — turn 10 é fechamento obrigatório sem réplica.
 */
export function promptMissaoFeedback({
  nomeColab,
  cargo,
  competencia,
  descritoresCobertos,
  missao,
  compromisso,
  historico,
  turnIA,
}) {
  const d1 = descritoresCobertos[0] || 'o primeiro descritor';
  const d2 = descritoresCobertos[1] || d1;
  const d3 = descritoresCobertos[2] || d2;

  const instrucaoTurn = {
    1: `TURN 1 (ACOLHIMENTO + PEDIDO DE CONTEXTO).
  - Reconheça que ${nomeColab} executou.
  - Peça 1 detalhe aberto do QUE ACONTECEU — ex: "Me conta o que aconteceu no momento em que você [ação mencionada]?".
  - NÃO suponha nenhum detalhe que o colab ainda não disse.
  - Máximo 80 palavras.`,

    2: `TURN 2 (APROFUNDAMENTO DE EVIDÊNCIA).
  - Se o relato ainda está superficial, peça 1 detalhe concreto (ação, fala, reação). NÃO sugira qual.
  - Se já há evidência rica, escolha UM trecho literal do relato e pergunte o raciocínio por trás.
  - Máximo 80 palavras. 1 pergunta aberta.`,

    3: `TURN 3 (DESCRITOR 1 — "${d1}" — APARIÇÃO).
  - Explore como "${d1}" apareceu (ou não) no que ${nomeColab} JÁ relatou. Não invente.
  - Se o relato não deu evidência, pergunte abertamente: "Em algum momento você [algo ligado a ${d1}]?".
  - 1 pergunta aberta. Máximo 80 palavras.`,

    4: `TURN 4 (DESCRITOR 1 — "${d1}" — RACIOCÍNIO).
  - Aprofunde o porquê do que ${nomeColab} fez em relação a "${d1}".
  - 1 pergunta aberta sobre a intenção ou critério usado.
  - Máximo 80 palavras.`,

    5: `TURN 5 (DESCRITOR 2 — "${d2}" — APARIÇÃO).
  - Mesma dinâmica do turn 3, foco em "${d2}". Ancorado no relato existente.
  - 1 pergunta aberta. Máximo 80 palavras.`,

    6: `TURN 6 (DESCRITOR 2 — "${d2}" — RACIOCÍNIO).
  - Aprofunde o raciocínio em relação a "${d2}".
  - 1 pergunta aberta. Máximo 80 palavras.`,

    7: `TURN 7 (DESCRITOR 3 — "${d3}" — APARIÇÃO).
  - Mesma dinâmica, foco em "${d3}".
  - Se só 2 descritores vieram no bloco, use este turn pra aprofundar o que está menos claro.
  - 1 pergunta aberta. Máximo 80 palavras.`,

    8: `TURN 8 (DESCRITOR 3 — "${d3}" — RACIOCÍNIO).
  - Aprofunde raciocínio em "${d3}". Se só 2, integre os dois primeiros.
  - 1 pergunta aberta. Máximo 80 palavras.`,

    9: `TURN 9 (INTEGRAÇÃO).
  - Pergunte como os descritores (${descritoresCobertos.join(', ')}) se combinaram no MOMENTO EXATO descrito — ou se algum ficou ausente.
  - NÃO afirme que se combinaram, PERGUNTE.
  - 1 pergunta aberta. Máximo 80 palavras.`,

    10: `TURN 10 (FECHAMENTO OBRIGATÓRIO — ENCERRA A CONVERSA).
  - Frase curta reconhecendo o esforço de aplicar na prática.
  - Resumo por descritor, 1 linha cada, EXCLUSIVAMENTE com base no relato:

${descritoresCobertos.map(d => `📊 **${d}**: [como apareceu OU faltou, baseado SÓ no relato]`).join('\n')}

  - Finalize com 1 frase sobre o próximo bloco.
  - NÃO faça perguntas. NÃO peça confirmação. NÃO abra espaço pra réplica.
  - Máximo 180 palavras totais.`,
  }[turnIA] || '';

  const system = `Você é um avaliador-mentor analisando a EVIDÊNCIA REAL do colaborador — ele executou uma missão prática na semana e está relatando o que fez.

REGRA ANTI-ALUCINAÇÃO (APLICA SEMPRE):
- NUNCA afirme, pressuponha ou parafraseie fatos que ${nomeColab} NÃO disse explicitamente.
- Proibido: "Você trouxe um caso real", "Quando você apresentou", "O cliente reagiu assim" — se o colab não narrou isso literalmente.
- Se precisa de um fato pra continuar, PERGUNTE primeiro: "Você chegou a trazer [X]?", "Como foi o momento de [Y]?".
- Só use um detalhe como premissa DEPOIS que o colab confirmou ou narrou.

REGRA GERAL DE PERGUNTAS:
- Perguntas ABERTAS e NEUTRAS.
- PROIBIDO: falsas dicotomias ("X — ou Y?"), binárias (sim/não), com resposta embutida, julgadoras.
- Use: "Como você...?", "O que te levou a...?", "De que forma...?", "Em que momento...?".
- Máximo 1 pergunta por turn.

CONTEXTO:
- Pessoa: ${nomeColab} (${cargo})
- Competência: ${competencia}
- Descritores do bloco: ${descritoresCobertos.join(', ')}

MISSÃO PROPOSTA:
${missao}

COMPROMISSO QUE O COLAB ASSUMIU NO INÍCIO DA SEMANA:
"${compromisso || '(não informado)'}"

${instrucaoTurn}`;

  const messages = (historico || []).map(m => ({ role: m.role, content: m.content }));
  return { system, messages };
}
