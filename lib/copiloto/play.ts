import {
  DISCOVERY_CHECKLIST,
  MEETING_KINDS,
  type CopilotPlay,
  type DiscoveryKey,
  type MeetingKind,
  type PaceQuestion,
} from './types';

const KINDS = new Set<MeetingKind>(MEETING_KINDS.map((item) => item.key));
const DISCOVERY_KEYS = new Set<DiscoveryKey>(DISCOVERY_CHECKLIST.map((item) => item.key));

const DEFAULT_QUESTIONS: Record<DiscoveryKey, string> = {
  situacao_atual: 'Como esse processo funciona hoje, do início ao fim?',
  dor_principal: 'Qual parte disso mais limita o resultado que vocês precisam entregar?',
  impacto: 'O que esse problema provoca em tempo, custo ou desempenho?',
  tentativas: 'O que vocês já tentaram e por que ainda não resolveu?',
  criterio: 'O que uma solução precisa provar para fazer sentido para vocês?',
  decisor: 'Quem mais precisa participar para esse próximo passo acontecer?',
  orcamento: 'Como essa prioridade disputa orçamento com outras iniciativas?',
  prazo: 'Até quando essa mudança precisa começar a produzir efeito?',
};

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isConsultativeOpener(value: string): boolean {
  return /^(quero|gostaria|posso|antes|para|como|o que|qual|vamos|minha proposta|a ideia)\b/i.test(value);
}

function inferredDiscovery(value: string): DiscoveryKey | null {
  const normalized = value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/como .*funciona hoje|processo atual|situacao atual/.test(normalized)) return 'situacao_atual';
  if (/dor principal|principal gargalo|mais incomoda|mais limita/.test(normalized)) return 'dor_principal';
  if (/impacto|consequencia|quanto custa|tempo perdido/.test(normalized)) return 'impacto';
  if (/ja tent|tentaram|tentativa/.test(normalized)) return 'tentativas';
  if (/criterio|como (vao|voces vao) escolher|precisa provar/.test(normalized)) return 'criterio';
  if (/quem .*decid|quem .*assin|quem .*valid|decisor/.test(normalized)) return 'decisor';
  if (/orcamento|investimento|faixa de valor/.test(normalized)) return 'orcamento';
  if (/ate quando|qual .*prazo|em que prazo|qual .*data/.test(normalized)) return 'prazo';
  return null;
}

export function normalizeMeetingKind(value: unknown): MeetingKind | null {
  return KINDS.has(value as MeetingKind) ? value as MeetingKind : null;
}

export function inferMeetingKind(input: { stage?: string | null; hasConversation?: boolean }): MeetingKind {
  const stage = String(input.stage || '');
  if (['proposta_enviada', 'negociacao', 'aguardando_aceite_vertho', 'contrato_enviado'].includes(stage)) {
    return 'negociacao';
  }
  if (input.hasConversation || stage === 'diagnostico_reuniao_realizada') return 'retorno';
  return 'primeira_conversa';
}

function fallbackGoal(kind: MeetingKind): string {
  if (kind === 'retorno') return 'Retomar o combinado anterior e sair com próximo passo, responsável e data confirmados.';
  if (kind === 'demonstracao') return 'Comprovar a dor na demonstração e sair com um recorte de piloto combinado.';
  if (kind === 'negociacao') return 'Resolver o bloqueio de decisão e sair com quem assina e a data do avanço.';
  return 'Classificar a aderência e, com dois sinais verdes, sair com uma demo de 25 minutos marcada.';
}

/**
 * O objetivo reserva do PACE (slide 23): se o principal nao for possivel, qual alternativa seguir.
 *
 * Precisa ser um AVANCO menor, nunca "entender melhor" e nunca o proprio fechamento do
 * objetivo principal — o campo nasceu como apelido do `closeWith` e isso o tornava inutil.
 */
function fallbackAlternativeGoal(kind: MeetingKind): string {
  if (kind === 'retorno') return 'Se o próximo passo não fechar hoje, sair com a lista de quem precisa participar e a data da próxima conversa.';
  if (kind === 'demonstracao') return 'Se o piloto não for combinado, sair com o cenário real que a próxima demonstração precisa provar.';
  if (kind === 'negociacao') return 'Se a decisão não avançar, sair com o critério que falta e quem precisa validá-lo.';
  return 'Se não houver aderência para uma demo, sair com a área e a pessoa certa para uma conversa futura.';
}

function fallbackClose(kind: MeetingKind): string {
  if (kind === 'retorno') return 'Podemos registrar agora o próximo passo, quem assume e a data?';
  if (kind === 'demonstracao') return 'Podemos definir o recorte do piloto e marcar a conversa com os envolvidos?';
  if (kind === 'negociacao') return 'Podemos confirmar agora quem assina e a data da decisão?';
  return 'Vimos dois sinais verdes; podemos abrir as agendas e marcar uma demo de 25 minutos?';
}

function normalizeMustAsk(item: any): CopilotPlay['mustAsk'][number] | null {
  const question = text(item?.text ?? item?.texto, 180);
  if (!question) return null;
  const rawDiscovery = item?.discovery ?? item?.descoberta;
  return {
    text: question,
    discovery: DISCOVERY_KEYS.has(rawDiscovery as DiscoveryKey)
      ? rawDiscovery as DiscoveryKey : inferredDiscovery(question),
    green: text(item?.green ?? item?.verde, 300) || 'A resposta confirma prioridade e espaço para avançar.',
    red: text(item?.red ?? item?.vermelho, 300) || 'A resposta mostra baixa prioridade ou processo já resolvido.',
    ifGreen: text(item?.ifGreen ?? item?.se_verde, 300) || 'Aprofunde a evidência e proponha o próximo passo.',
  };
}

function fallbackMustAsk(question: PaceQuestion): CopilotPlay['mustAsk'][number] {
  return {
    text: text(question.text, 180),
    discovery: question.discovery,
    green: 'A resposta revela dor, impacto ou intenção concreta de mudança.',
    red: 'A resposta indica baixa prioridade ou ausência de aderência neste momento.',
    ifGreen: 'Aprofunde o exemplo e conecte ao próximo passo desta reunião.',
  };
}

function unkeyedFallbackQuestions(kind: MeetingKind): string[] {
  if (kind === 'retorno') return [
    'O que mudou desde a nossa última conversa e precisa ser considerado hoje?',
    'Do combinado anterior, o que avançou e onde ainda existe bloqueio?',
    'Qual próximo movimento faria esta conversa valer a pena para vocês?',
  ];
  if (kind === 'demonstracao') return [
    'Qual evidência na demonstração faria vocês dizerem que vale testar em um piloto?',
    'Em qual situação real vocês gostariam de ver essa capacidade aplicada?',
    'Se a demonstração comprovar a dor, qual piloto faria sentido combinar hoje?',
  ];
  if (kind === 'negociacao') return [
    'O que ainda impede uma decisão segura neste momento?',
    'Qual condição precisa ficar registrada para vocês avançarem?',
    'Qual compromisso concreto podemos assumir ao terminar esta conversa?',
  ];
  return [
    'O que faria esta conversa valer o tempo de vocês hoje?',
    'Que mudança justificaria avançarmos para uma próxima conversa?',
    'Se houver aderência, qual seria o próximo passo mais útil para vocês?',
  ];
}

export function normalizeCopilotPlay(
  value: unknown,
  options: {
    kind: MeetingKind;
    audience: string;
    goalThisHour: string;
    factsCount: number;
    hasPrivateContext?: boolean;
    covered: DiscoveryKey[];
    fallbackQuestions: PaceQuestion[];
  },
  // `fallbackGoal` e opcional no tipo para planos ja salvos, mas quem passa por aqui
  // sempre sai com ele preenchido: e o que permite o objetivo reserva ter valor proprio.
): CopilotPlay & { fallbackGoal: string } {
  const raw: any = value && typeof value === 'object' ? value : {};
  // The user's editable meeting kind is authoritative; the model cannot silently
  // turn a return or negotiation into another script shape.
  const kind = options.kind;
  const covered = new Set(kind === 'retorno' ? options.covered : []);
  const seenDiscoveries = new Set<DiscoveryKey>();
  const seenTexts = new Set<string>();
  const mustAsk: CopilotPlay['mustAsk'] = [];

  for (const rawItem of (Array.isArray(raw.mustAsk ?? raw.must_ask) ? raw.mustAsk ?? raw.must_ask : [])) {
    const item = normalizeMustAsk(rawItem);
    if (!item || (item.discovery && covered.has(item.discovery))) continue;
    const normalizedText = item.text.toLocaleLowerCase('pt-BR');
    if (seenTexts.has(normalizedText) || (item.discovery && seenDiscoveries.has(item.discovery))) continue;
    mustAsk.push(item);
    seenTexts.add(normalizedText);
    if (item.discovery) seenDiscoveries.add(item.discovery);
    if (mustAsk.length === 3) break;
  }

  for (const question of options.fallbackQuestions) {
    if (mustAsk.length === 3) break;
    if (!question.text || (question.discovery && covered.has(question.discovery))) continue;
    const normalizedText = question.text.toLocaleLowerCase('pt-BR');
    if (seenTexts.has(normalizedText) || (question.discovery && seenDiscoveries.has(question.discovery))) continue;
    mustAsk.push(fallbackMustAsk(question));
    seenTexts.add(normalizedText);
    if (question.discovery) seenDiscoveries.add(question.discovery);
  }

  for (const item of DISCOVERY_CHECKLIST) {
    if (mustAsk.length === 3) break;
    if (covered.has(item.key) || seenDiscoveries.has(item.key)) continue;
    mustAsk.push(fallbackMustAsk({
      phase: item.key === 'criterio' || item.key === 'decisor' || item.key === 'prazo' ? 'engajar' : 'analisar',
      discovery: item.key,
      text: DEFAULT_QUESTIONS[item.key],
      why: item.label,
    }));
    seenDiscoveries.add(item.key);
  }

  for (const question of unkeyedFallbackQuestions(kind)) {
    if (mustAsk.length === 3) break;
    const normalizedText = question.toLocaleLowerCase('pt-BR');
    if (seenTexts.has(normalizedText)) continue;
    mustAsk.push({
      text: question,
      discovery: null,
      green: 'O cliente explicita uma condição objetiva para avançar.',
      red: 'Não há condição ou interesse concreto em continuar.',
      ifGreen: 'Confirme a condição e transforme-a em um combinado com data.',
    });
    seenTexts.add(normalizedText);
  }

  const openers = (Array.isArray(raw.openers) ? raw.openers : []).map((item: any) => {
    const say = text(item?.say ?? item?.fale, 500);
    const rawFactIndex = item?.factIndex ?? item?.fact_index;
    const hasClaimedFact = rawFactIndex !== null && rawFactIndex !== undefined;
    const hasValidFact = Number.isInteger(rawFactIndex)
      && Number(rawFactIndex) >= 0
      && Number(rawFactIndex) < options.factsCount;
    // An invalid citation can never silently become a private-briefing citation.
    if (!say || (hasClaimedFact && !hasValidFact)) return null;
    const factIndex = hasValidFact ? Number(rawFactIndex) : null;
    // With no private context, citation-free openings must remain consultative
    // instead of smuggling in an unsupported claim about the account.
    if (factIndex === null && !options.hasPrivateContext && !isConsultativeOpener(say)) return null;
    return { say, factIndex };
  }).filter((item: { say: string; factIndex: number | null } | null): item is { say: string; factIndex: number | null } => Boolean(item)).slice(0, 2);

  const fallbackOpeners = kind === 'retorno'
    ? [
        'Quero retomar o que combinamos, validar o que mudou e decidir juntos o próximo avanço.',
        'Antes de avançarmos, posso confirmar o que continua válido desde a nossa última conversa?',
      ]
    : [
        'Quero entender o contexto de vocês e, ao final, decidirmos se existe um próximo passo útil para os dois lados.',
        'Posso começar pelo que faria esta conversa valer o tempo de vocês hoje?',
      ];
  while (openers.length < 2) openers.push({ say: fallbackOpeners[openers.length], factIndex: null });

  const landmine = raw.landmine && typeof raw.landmine === 'object' ? raw.landmine : {};
  const goalThisHour = text(options.goalThisHour, 700)
    || text(raw.goalThisHour ?? raw.goal_this_hour ?? raw.objetivo_desta_hora, 700) || fallbackGoal(kind);
  const doNot = (Array.isArray(raw.doNot ?? raw.nao_faca) ? raw.doNot ?? raw.nao_faca : [])
    .map((item: unknown) => text(item, 300)).filter(Boolean).slice(0, 3);
  if (!doNot.length) {
    doNot.push(kind === 'demonstracao'
      ? 'Não faça um tour de produto: mostre apenas o que comprova a dor validada.'
      : 'Não prometa resultado ou ROI antes de validar contexto, critério e responsabilidade do cliente.');
  }

  return {
    kind,
    audience: text(options.audience, 500) || text(raw.audience ?? raw.publico, 500) || 'Participante ainda não confirmado',
    goalThisHour,
    fallbackGoal: text(raw.fallbackGoal ?? raw.fallback_goal ?? raw.objetivo_reserva, 700)
      || fallbackAlternativeGoal(kind),
    openers,
    mustAsk: mustAsk.slice(0, 3),
    doNot,
    closeWith: text(raw.closeWith ?? raw.close_with ?? raw.feche_pedindo, 700) || fallbackClose(kind),
    landmine: {
      objection: text(landmine.objection ?? landmine.objecao, 500) || 'Não é prioridade neste momento.',
      ask: text(landmine.ask ?? landmine.pergunte, 500) || 'O que precisaria mudar para isso se tornar prioridade?',
    },
  };
}
