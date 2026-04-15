/**
 * Simulador de Colaborador pra testes de temporada completa.
 * Gera a mensagem que o colab mandaria em cada turn, coerente com um
 * perfil de evolução pré-escolhido pelo admin.
 */

const PERFIS = {
  evolucao_confirmada: `O colaborador DEMONSTROU evolução clara ao longo da temporada:
- Sems 1-4: reflexões iniciais um pouco superficiais mas engajadas, começa a articular padrões.
- Sems 5-8: começa a trazer exemplos concretos, percebe os comportamentos em si mesmo.
- Sems 9-13: articula claramente o que mudou, com evidências específicas e aplicação no trabalho real.
- Cita exemplos práticos, nomeia comportamentos novos, reconhece o que ainda está desenvolvendo.`,

  evolucao_parcial: `O colaborador mostrou evolução PARCIAL:
- Alguns descritores ficaram claros, outros continuaram difíceis.
- Reflexões variam em profundidade: ora ricas, ora superficiais.
- Executa missões mas nem sempre integra todos os descritores.
- Reconhece aprendizado mas tem dificuldade pra generalizar.`,

  estagnacao: `O colaborador estagnou na temporada:
- Reflexões genéricas ("foi legal", "aprendi bastante").
- Dificuldade de trazer exemplos concretos.
- Desafios executados parcialmente.
- Não articula claramente o que mudou.
- Mas engajado, responde sem má vontade.`,

  regressao: `O colaborador regrediu ao longo da temporada:
- Começou bem nas primeiras semanas (motivação inicial).
- Foi ficando mais curto e genérico.
- Nas últimas semanas mal responde, demonstra desinteresse.
- Não executa missões, não traz evidências reais.`,
};

/**
 * Gera a próxima mensagem do colab no chat simulado.
 *
 * @param {Object} ctx
 * @param {string} ctx.perfilEvolucao - evolucao_confirmada|evolucao_parcial|estagnacao|regressao
 * @param {number} ctx.semana - 1-14
 * @param {string} ctx.tipoChat - 'socratic' | 'missao_feedback' | 'analytic' | 'qualitativa_fechamento' | 'cenario_final'
 * @param {string} ctx.competencia
 * @param {string} ctx.descritor
 * @param {string} [ctx.desafio] - desafio da semana (pra conteudo)
 * @param {string} [ctx.missao] - texto da missão (pra aplicacao modo pratica)
 * @param {string} [ctx.cenario] - texto do cenário (pra aplicacao modo cenario ou sem 14)
 * @param {Array} ctx.historico - mensagens anteriores [{role, content}]
 * @param {number} ctx.turnUser - número do turn do user (1, 2, 3...)
 * @param {string} ctx.cargo
 */
export function promptSimuladorColab(ctx) {
  const perfilInstr = PERFIS[ctx.perfilEvolucao] || PERFIS.evolucao_parcial;

  const contexto = [
    `Competência: ${ctx.competencia}`,
    `Descritor: ${ctx.descritor}`,
    `Cargo do colab: ${ctx.cargo}`,
    `Semana: ${ctx.semana}/14`,
    `Tipo do chat: ${ctx.tipoChat}`,
    ctx.desafio && `Desafio da semana: "${ctx.desafio}"`,
    ctx.missao && `Missão prática: "${ctx.missao.slice(0, 300)}"`,
    ctx.cenario && `Cenário: "${ctx.cenario.slice(0, 400)}"`,
  ].filter(Boolean).join('\n');

  const historicoStr = (ctx.historico || []).slice(-6).map(m => `${m.role === 'user' ? 'COLAB' : 'IA'}: ${m.content.slice(0, 300)}`).join('\n\n');

  const system = `Você está SIMULANDO um colaborador numa plataforma de desenvolvimento. Retorne APENAS a próxima fala do colab — sem aspas, sem prefixo, sem comentários.

PERFIL DE EVOLUÇÃO DESTE COLABORADOR:
${perfilInstr}

REGRAS:
- Fale como colaborador real: primeira pessoa, tom natural, português brasileiro.
- Tamanho: 2-5 frases (varie pra não soar robótico).
- Cite situações concretas do seu cargo (${ctx.cargo}) quando apropriado.
- Nunca saia do personagem — não dê "bastidor" dizendo "como simulador eu faria X".
- Coerência com perfil: responda do jeito que um colab com esse perfil responderia nessa semana.
- Turn atual do colab: ${ctx.turnUser}.`;

  const user = `CONTEXTO:
${contexto}

HISTÓRICO RECENTE (últimas trocas):
${historicoStr || '(início da conversa)'}

Gere a próxima fala do colab. Apenas o texto, sem aspas.`;

  return { system, user };
}

/**
 * Gera o COMPROMISSO do colab pra sems de Missão Prática (4/8/12).
 * Texto curto: 1-2 frases dizendo qual situação da rotina vai usar.
 */
export function promptSimuladorCompromisso({ perfilEvolucao, competencia, descritoresCobertos, cargo, missao }) {
  const perfilInstr = PERFIS[perfilEvolucao] || PERFIS.evolucao_parcial;
  const system = `Você está SIMULANDO um colaborador declarando seu compromisso de aplicar uma missão prática na semana. Retorne APENAS o texto do compromisso — sem aspas, sem prefixo.

PERFIL: ${perfilInstr}

REGRAS:
- 1-2 frases curtas.
- Mencione situação concreta da rotina de ${cargo}.
- Perfil 'estagnacao' ou 'regressao': compromisso pode ser vago/genérico.
- Perfil 'evolucao_confirmada': compromisso específico e orientado a ação.`;

  const user = `Competência: ${competencia}
Descritores a integrar: ${descritoresCobertos.join(', ')}
Cargo: ${cargo}
Missão proposta: "${(missao || '').slice(0, 400)}"

Gere o compromisso.`;

  return { system, user };
}
