export {};
/* eslint-disable */
// S4 — valida o HISTORY CACHING do socrático por A/B com JUIZ INDEPENDENTE.
// Para cada estado de conversa (turnos 1..6), gera a resposta do mentor com o flag
// OFF (userSuffix reconcatenado no system = PRODUÇÃO) e ON (history caching:
// userSuffix na cauda da mensagem + cache na última assistant). Um juiz de OUTRA
// família (Gemini, não Claude) pontua as duas em qualidade socrática, CEGO a qual
// é qual (ordem A/B trocada por turno p/ matar viés de posição).
// Gate de NÃO-INFERIORIDADE: média(ON) >= média(OFF) - 0.3 E nenhum caso ON pior.
// Exercita grounding (relocação completa) e faz o system passar de 1024 (cache real).
// Rodar: npx tsx scripts/_valida-hc.ts
process.loadEnvFile('.env.local');

const GROUNDING = `Negociação baseada em valor (não em preço): ancore na dor do cliente antes de falar preço.
Concessões devem ser trocadas, nunca dadas de graça ("se eu fizer X, você fecha hoje?").
BATNA: conheça sua melhor alternativa antes de sentar à mesa — isso sustenta o "não".
Fechamento por compromisso incremental: micro-acordos ao longo da conversa reduzem a resistência final.`;

// 2 cenários (perfis DISC diferentes) → mais poder estatístico.
const SCENARIOS = [
  {
    nomeColab: 'Bruna', cargo: 'Representante Comercial', perfilDominante: 'CS',
    competencia: 'Negociação e Fechamento',
    descritor: 'Conduz negociações buscando acordos de valor mútuo, sustentando preço quando necessário',
    desafio: 'Esta semana, conduza uma negociação real e registre onde você cedeu e onde sustentou valor.',
    groundingContext: GROUNDING,
  },
  {
    nomeColab: 'Diego', cargo: 'Representante Comercial', perfilDominante: 'D',
    competencia: 'Negociação e Fechamento',
    descritor: 'Escuta a necessidade do cliente antes de propor solução, evitando fechar cedo demais',
    desafio: 'Esta semana, numa negociação real, segure o impulso de fechar e mapeie a real necessidade antes de propor.',
    groundingContext: GROUNDING,
  },
  {
    nomeColab: 'Ivan', cargo: 'Representante Comercial', perfilDominante: 'I',
    competencia: 'Negociação e Fechamento',
    descritor: 'Sustenta condições combinadas mesmo sob pressão de relacionamento com o cliente',
    desafio: 'Esta semana, sustente uma condição combinada mesmo quando o cliente apelar pela relação pessoal.',
    groundingContext: GROUNDING,
  },
  {
    nomeColab: 'Sara', cargo: 'Representante Comercial', perfilDominante: 'S',
    competencia: 'Negociação e Fechamento',
    descritor: 'Conduz o fechamento de forma assertiva, sem adiar a decisão por medo do conflito',
    desafio: 'Esta semana, conduza um fechamento sem adiar a decisão, mesmo sentindo desconforto com o conflito.',
    groundingContext: GROUNDING,
  },
];

async function main() {
  const { callAIChat, callAI } = await import('@/actions/ai-client');
  const { promptSocratic } = await import('@/lib/season-engine/prompts/socratic');
  const { promptSimuladorColab } = await import('@/lib/season-engine/prompts/simulador-temporada');

  const maxIA = 6;
  const casos: any[] = [];

  for (const CTX of SCENARIOS) {
    const historico: any[] = [];
    for (let turnIA = 1; turnIA <= maxIA; turnIA++) {
      const { system, grounding, instrucao, messages } = promptSocratic({ ...CTX, historico, turnIA }) as any;
      const msgs = messages.length ? messages : [{ role: 'user', content: '[INICIE]' }];

      // OFF = produção: grounding + instrução no CORPO do system.
      const systemOff = [system, grounding, instrucao].filter(Boolean).join('\n\n');
      const off = (await callAIChat(systemOff, msgs as any, {}, 2000, {})).trim();
      // ON = systemSuffix: grounding no bloco 1 (cacheado), instrução no bloco 2
      // (volátil, mas AINDA no system → mantém autoridade). Output-neutral.
      const systemBlock1 = [system, grounding].filter(Boolean).join('\n\n');
      const on = (await callAIChat(systemBlock1, msgs as any, {}, 2000, { systemSuffix: instrucao })).trim();

      const swap = turnIA % 2 === 0; // alterna posição p/ matar viés
      // PAINEL: 2 juízes de famílias diferentes (Gemini + Luna/OpenAI)
      // Painel: Gemini (família diferente do mentor) + Haiku. Luna caiu fora
      // (401 intermitente reincidente). Como AMBOS candidatos são Sonnet, viés de
      // família é simétrico e não enviesa o A/B.
      const jurados = ['gemini-3.1-flash-lite', 'claude-haiku-4-5-20251001'];
      const vs = await Promise.all(jurados.map((jm) => judge(callAI, jm, CTX, historico, turnIA, swap ? on : off, swap ? off : on)));
      const notaOff = mean(vs.map((v) => (swap ? v.notaB : v.notaA)));
      const notaOn = mean(vs.map((v) => (swap ? v.notaA : v.notaB)));
      // "ON pior" só se o PAINEL (maioria) concordar
      const votosOnPior = vs.filter((v) => v.pior === (swap ? 'A' : 'B')).length;
      const onPior = votosOnPior >= jurados.length; // unânime
      casos.push({ perfil: CTX.perfilDominante, turnIA, notaOff, notaOn, onPior });
      console.log(`${CTX.perfilDominante} t${turnIA}: OFF=${notaOff.toFixed(1)} ON=${notaOn.toFixed(1)} ${onPior ? '⚠ ON PIOR (painel)' : ''}`);

      historico.push({ role: 'assistant', content: off });
      if (turnIA < maxIA) {
        const simP = promptSimuladorColab({
          perfilEvolucao: 'evolucao_parcial', semana: 1, tipoChat: 'socratic',
          competencia: CTX.competencia, descritor: CTX.descritor, desafio: CTX.desafio,
          historico, turnUser: turnIA, cargo: CTX.cargo,
        });
        const colab = (await callAI(simP.system, simP.user, { model: 'claude-haiku-4-5-20251001' }, 1000)).trim();
        historico.push({ role: 'user', content: colab });
      }
    }
  }

  const offAvg = mean(casos.map((c) => c.notaOff));
  const onAvg = mean(casos.map((c) => c.notaOn));
  // NÃO-INFERIORIDADE POR PERFIL (o D denunciava o history-caching): nenhum
  // perfil pode cair > 0,3, E o total não cai > 0,2. Pega degradação de subgrupo
  // que o total mascara.
  const perfis = [...new Set(casos.map((c) => c.perfil))];
  const porPerfil = perfis.map((p) => {
    const cs = casos.filter((c) => c.perfil === p);
    return { perfil: p, off: mean(cs.map((c) => c.notaOff)), on: mean(cs.map((c) => c.notaOn)) };
  });
  const perfilDegradado = porPerfil.filter((p) => p.on < p.off - 0.3);
  const promovido = onAvg >= offAvg - 0.2 && perfilDegradado.length === 0;
  console.log(`\n== GATE (painel cego Gemini+Haiku, ${casos.length} casos, não-inferioridade POR PERFIL) ==`);
  for (const p of porPerfil) console.log(`  perfil ${p.perfil}: OFF=${p.off.toFixed(2)} ON=${p.on.toFixed(2)} ${p.on < p.off - 0.3 ? '⚠ DEGRADADO' : 'ok'}`);
  console.log(`  TOTAL: OFF=${offAvg.toFixed(2)} ON=${onAvg.toFixed(2)}`);
  console.log(promovido
    ? '✓ PROMOVIDO — ON não-inferior em todos os perfis. Seguro ligar em produção.'
    : '✗ REPROVADO — degradação (algum perfil ou total). NÃO ligar.');
}

function mean(a: number[]) { return a.reduce((x, y) => x + y, 0) / (a.length || 1); }

async function judge(callAI: any, judgeModel: string, ctx: any, historico: any[], turnIA: number, a: string, b: string) {
  const transcript = historico.map((m) => `${m.role === 'user' ? 'COLAB' : 'MENTOR'}: ${m.content}`).join('\n');
  const system = `Você é um avaliador imparcial de qualidade de mentoria socrática. Não tem preferência por [A] ou [B]. Julgue SÓ a qualidade pedagógica de cada resposta como próximo turno do mentor.`;
  const user = `Mentor socrático conversando com ${ctx.nomeColab} (${ctx.cargo}) sobre "${ctx.competencia}". Turno ${turnIA} de 6.
Bom mentor socrático: curioso, acolhedor, NÃO julga, NÃO dá resposta pronta, faz UMA pergunta aberta por turno (exceto fechamento no turno 6). No turno 6 fecha com veredito/insight/compromisso, sem perguntas.

CONVERSA ATÉ AQUI:
${transcript || '(início da conversa)'}

Duas respostas candidatas do mentor para o próximo turno:
[A]: ${a}

[B]: ${b}

Pontue CADA uma de 1 a 4 (1=ruim: diretiva/julgadora/múltiplas perguntas; 4=excelente: curiosa, uma pergunta clara, acolhedora). Diga qual é PIOR se houver diferença clara. Responda SÓ JSON:
{"notaA":1-4,"notaB":1-4,"pior":"A"|"B"|"empate","motivo":"breve"}`;
  const raw = await callAI(system, user, { model: judgeModel }, 500);
  let j: any = {};
  try { const m = raw.match(/\{[\s\S]*\}/); j = JSON.parse(m ? m[0] : raw); } catch {}
  return { notaA: Number(j.notaA) || 0, notaB: Number(j.notaB) || 0, pior: j.pior || 'empate', motivo: j.motivo || '' };
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
