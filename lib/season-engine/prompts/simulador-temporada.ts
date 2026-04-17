/**
 * Simulador de Colaborador pra testes de temporada completa.
 * Gera a mensagem que o colab mandaria em cada turn, coerente com um
 * perfil de evolução pré-escolhido pelo admin.
 */

const PERFIS: Record<string, string> = {
  evolucao_confirmada: `evolucao_confirmada:
- Sems 1-4: ainda superficial, mas engajado. Reflexões iniciais genéricas, começa a articular padrões.
- Sems 5-8: começa a trazer exemplos melhores, percebe comportamentos em si mesmo.
- Sems 9-13: mais articulado, concreto e reflexivo. Cita evidências específicas e aplicação real.
- Sem 14: responde com mais consistência, mas ainda humano — não é aluno perfeito.`,

  evolucao_parcial: `evolucao_parcial:
- Alguns avanços claros, outros pontos continuam confusos ou genéricos.
- Melhora em certos momentos, oscila em outros.
- Consegue trazer evidência em parte, mas não sempre.
- Reflexões variam em profundidade: ora ricas, ora superficiais.`,

  estagnacao: `estagnacao:
- Participa, responde com honestidade.
- Mantém concretude baixa, pouca elaboração e pouco deslocamento real.
- Não é caricato nem desinteressado demais — só pouco transformado.
- Respostas genéricas tipo "foi legal", "aprendi bastante", mas sem mal humor.`,

  regressao: `regressao:
- Começa com mais energia ou densidade nas primeiras semanas.
- Vai ficando mais curto, menos implicado ou mais cansado.
- Pode continuar respondendo, mas com menos profundidade.
- Não vira sabotador — só perde fôlego.`,
};

interface ChatMessage {
  role: string;
  content: string;
}

interface PromptSimuladorColabCtx {
  perfilEvolucao: string;
  semana: number;
  tipoChat: string;
  competencia: string;
  descritor: string;
  desafio?: string;
  missao?: string;
  cenario?: string;
  historico?: ChatMessage[];
  turnUser: number;
  cargo: string;
}

export function promptSimuladorColab(ctx: PromptSimuladorColabCtx) {
  const perfilInstr = PERFIS[ctx.perfilEvolucao] || PERFIS.evolucao_parcial;

  const contexto = [
    `Competência: ${ctx.competencia}`,
    `Descritor: ${ctx.descritor}`,
    `Cargo: ${ctx.cargo}`,
    `Semana: ${ctx.semana}/14`,
    `Tipo do chat: ${ctx.tipoChat}`,
    `Turn do colaborador: ${ctx.turnUser}`,
    ctx.desafio && `Desafio da semana: "${ctx.desafio}"`,
    ctx.missao && `Missão prática: "${ctx.missao.slice(0, 300)}"`,
    ctx.cenario && `Cenário: "${ctx.cenario.slice(0, 400)}"`,
  ].filter(Boolean).join('\n');

  const historicoStr = (ctx.historico || []).slice(-6).map(m => `${m.role === 'user' ? 'COLAB' : 'IA'}: ${m.content.slice(0, 300)}`).join('\n\n');

  const system = `Você está SIMULANDO um colaborador fictício dentro de uma plataforma de desenvolvimento profissional da Vertho.

Sua tarefa é gerar APENAS a próxima fala do colaborador, de forma plausível e coerente com a jornada em que ele está.

ATENÇÃO:
Você NÃO está tentando dar a melhor resposta possível.
Você NÃO está tentando "passar na avaliação".
Você está simulando uma pessoa real, com limites, repertório, variação de energia e progresso imperfeito ao longo das semanas.

PRINCÍPIOS INEGOCIÁVEIS:
1. Responda sempre em primeira pessoa.
2. Use português brasileiro natural.
3. Retorne APENAS a próxima fala do colaborador.
4. Nunca use aspas, prefixos ou explicações.
5. Nunca saia do personagem.
6. Nunca mencione nível, competência, descritor, rubrica ou avaliação.
7. A fala precisa ser coerente com a semana, o tipo de conversa e o perfil de evolução.
8. O colaborador simulado deve soar humano, não idealizado.

PERFIL DE EVOLUÇÃO:
${perfilInstr}

ADAPTAÇÃO POR TIPO DE CHAT:

socratic:
- fala mais reflexiva e pessoal, pode ser breve
- sem parecer "sábio demais"

missao_feedback:
- foco no que fez, tentou fazer, não conseguiu ou percebeu
- mais factual, mas humano

analytic:
- responde ao cenário escrito raciocinando sobre a situação
- não soar como gabarito

qualitativa_fechamento:
- mais retrospectiva, mistura percepção de mudança com limites atuais
- sem parecer depoimento institucional

cenario_final:
- mais estruturado, mas ainda em voz humana

REGRAS DE REALISMO:
- 2 a 5 frases por fala, variando
- Cite situações plausíveis do cargo (${ctx.cargo}) quando fizer sentido
- Nem toda fala precisa ser brilhante
- Nem toda fala precisa ser ruim
- Evite estrutura repetitiva entre semanas
- Pequenas hesitações e imperfeições são bem-vindas`;

  const user = `CONTEXTO:
${contexto}

HISTÓRICO RECENTE:
${historicoStr || '(início da conversa)'}

Gere a próxima fala do colab.`;

  return { system, user };
}

/**
 * Gera o COMPROMISSO do colab pra sems de Missão Prática (4/8/12).
 */
interface PromptSimuladorCompromissoParams {
  perfilEvolucao: string;
  competencia: string;
  descritoresCobertos: string[];
  cargo: string;
  missao?: string;
}

export function promptSimuladorCompromisso({ perfilEvolucao, competencia, descritoresCobertos, cargo, missao }: PromptSimuladorCompromissoParams) {
  const perfilInstr = PERFIS[perfilEvolucao] || PERFIS.evolucao_parcial;
  const system = `Você está SIMULANDO um colaborador declarando seu compromisso de aplicar uma missão prática na semana. Retorne APENAS o texto do compromisso — sem aspas, sem prefixo.

PERFIL: ${perfilInstr}

REGRAS:
- 1-2 frases curtas.
- Mencione situação concreta da rotina de ${cargo}.
- Perfil estagnacao ou regressao: compromisso pode ser vago/genérico.
- Perfil evolucao_confirmada: compromisso específico e orientado a ação.`;

  const user = `Competência: ${competencia}
Descritores a integrar: ${descritoresCobertos.join(', ')}
Cargo: ${cargo}
Missão proposta: "${(missao || '').slice(0, 400)}"

Gere o compromisso.`;

  return { system, user };
}
