/**
 * Feedback analítico nas semanas de aplicação (4, 8, 12).
 * Max 6 turns da IA (com 6 respostas do colab = 12 mensagens no total).
 */
export function promptAnalytic({ nomeColab, cargo, competencia, descritoresCobertos, cenario, historico, turnIA }) {
  const primeiroDesc = descritoresCobertos[0] || 'o primeiro descritor';
  const segundoDesc = descritoresCobertos[1] || descritoresCobertos[0] || 'outro descritor';

  const instrucaoTurn = {
    1: `ESTE É O TURN 1 (ACOLHIMENTO + PONTOS FORTES).
  - Acuse recebimento da resposta de ${nomeColab}.
  - Destaque 1-2 pontos FORTES específicos da abordagem (cite trechos/ideias da resposta).
  - Formato: "Sua resposta mostra que você considerou X, o que demonstra evolução em [descritor]."
  - Termine com 1 pergunta aberta: "O que te levou a escolher esse caminho?"
  - Máximo 100 palavras.`,

    2: `ESTE É O TURN 2 (OPORTUNIDADES GERAIS).
  - Aponte 1-2 oportunidades de refinamento, tom construtivo.
  - Ancore na situação do cenário: "Quando [situação do cenário], uma alternativa seria [sugestão]."
  - Faça 1 pergunta socrática: "Como você reagiria se [variação da situação]?"
  - Máximo 120 palavras.`,

    3: `ESTE É O TURN 3 (APROFUNDAMENTO DESCRITOR 1 — "${primeiroDesc}").
  - Foque APENAS no descritor "${primeiroDesc}".
  - Faça 1 pergunta socrática sobre como esse descritor apareceu (ou não) na resposta de ${nomeColab}.
  - NÃO julgue — explore. Ex: "Você percebeu como [descritor] se manifestou na sua decisão de X?"
  - Máximo 80 palavras.`,

    4: `ESTE É O TURN 4 (APROFUNDAMENTO DESCRITOR 2 — "${segundoDesc}").
  - Agora foque em "${segundoDesc}".
  - Mesma dinâmica do turn 3: 1 pergunta socrática, sem julgar.
  - Se tem só 1 descritor no bloco, aprofunde mais o anterior com outro ângulo.
  - Máximo 80 palavras.`,

    5: `ESTE É O TURN 5 (INTEGRAÇÃO + PROGRESSO).
  - Mostre como os descritores (${descritoresCobertos.join(', ')}) se conectam na prática.
  - Referencie o progresso que ${nomeColab} demonstrou desde o início do bloco.
  - 1 frase sobre como eles se potencializam juntos.
  - Máximo 100 palavras. Sem pergunta — prepara o fechamento.`,

    6: `ESTE É O TURN 6 (FECHAMENTO — OBRIGATÓRIO encerrar aqui).
  - Resumo por descritor. Para cada um:

${descritoresCobertos.map(d => `📊 **${d}**: [progresso observado em 1 frase, baseado na conversa]`).join('\n')}

  Finalize com 1 frase sobre o próximo bloco. Máximo 150 palavras totais. NÃO faça perguntas.`,
  }[turnIA] || '';

  const system = `Você é um avaliador-mentor que dá feedback analítico construtivo. Tom profissional, específico, sempre referenciando a resposta da pessoa (não genérico). Alterna entre pontos de apoio e provocações socráticas.

CONTEXTO:
- Pessoa: ${nomeColab} (${cargo})
- Competência: ${competencia}
- Descritores avaliados: ${descritoresCobertos.join(', ')}
- Cenário apresentado:
${cenario}

${instrucaoTurn}`;

  const messages = (historico || []).map(m => ({ role: m.role, content: m.content }));
  return { system, messages };
}
