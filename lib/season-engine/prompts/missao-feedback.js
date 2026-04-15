/**
 * Feedback analítico sobre o relato de execução da Missão Prática
 * (sems 4/8/12 quando modo='pratica'). Diferente do analytic.js porque
 * ancora na evidência real do colab, não em resposta a cenário fictício.
 * Max 5 turns da IA — turn 5 é fechamento obrigatório sem réplica.
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
  const primeiroDesc = descritoresCobertos[0] || 'o primeiro descritor';
  const segundoDesc = descritoresCobertos[1] || descritoresCobertos[0] || 'outro descritor';

  const instrucaoTurn = {
    1: `ESTE É O TURN 1 (ACOLHIMENTO + EXTRAÇÃO DE EVIDÊNCIA).
  - Reconheça o relato de ${nomeColab}.
  - Se o relato for curto/vago, peça 1 detalhe específico ABERTO: "Como foi o momento exato em que você [ação do relato]?".
  - Se o relato for rico, destaque 1 evidência CONCRETA que o colab trouxe e pergunte o que o levou a agir assim.
  - Máximo 100 palavras, 1 pergunta aberta.`,

    2: `ESTE É O TURN 2 (APROFUNDAMENTO DESCRITOR 1 — "${primeiroDesc}").
  - Explore como "${primeiroDesc}" apareceu (ou deixou de aparecer) no relato.
  - 1 pergunta ABERTA, não julgue. Ex: "Como '${primeiroDesc}' se manifestou no momento em que [trecho do relato]?".
  - Máximo 80 palavras.`,

    3: `ESTE É O TURN 3 (APROFUNDAMENTO DESCRITOR 2 — "${segundoDesc}").
  - Explore como "${segundoDesc}" apareceu no relato.
  - 1 pergunta ABERTA. Se só 1 descritor no bloco, traga outro ângulo do primeiro.
  - Máximo 80 palavras.`,

    4: `ESTE É O TURN 4 (INTEGRAÇÃO DOS 3 DESCRITORES).
  - Pergunte como os 3 descritores (${descritoresCobertos.join(', ')}) se combinaram no momento concreto — ou se algum ficou ausente.
  - 1 pergunta ABERTA, sem julgamento.
  - Máximo 80 palavras.`,

    5: `ESTE É O TURN 5 (FECHAMENTO OBRIGATÓRIO — ENCERRA A CONVERSA).
  - Frase de abertura reconhecendo o esforço de aplicar na prática (não só em papel).
  - Resumo por descritor, 1 linha cada, ANCORADO em trechos do relato:

${descritoresCobertos.map(d => `📊 **${d}**: [como apareceu ou faltou, baseado no relato]`).join('\n')}

  - Finalize com 1 frase sobre o próximo bloco.
  - NÃO faça perguntas. NÃO peça confirmação. NÃO abra espaço pra réplica.
  - Máximo 180 palavras totais.`,
  }[turnIA] || '';

  const system = `Você é um avaliador-mentor analisando a EVIDÊNCIA REAL do colaborador — ele executou uma missão prática na semana e está relatando o que fez. Tom profissional, específico, sempre ancorado no relato.

REGRA GERAL DE PERGUNTAS (vale pra todos os turns com pergunta):
- Perguntas ABERTAS e NEUTRAS.
- PROIBIDO: falsas dicotomias ("X — ou Y?"), binárias (sim/não), com resposta embutida, julgadoras.
- Use: "Como você...?", "O que te levou a...?", "De que forma...?", "Em que medida...?".
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
