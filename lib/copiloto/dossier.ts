import {
  ACCOUNT_MOMENTS,
  CONVERSATION_GOALS,
  DISCOVERY_CHECKLIST,
  EVIDENCE_CONFIDENCES,
  type AccountMoment,
  type AccountSnapshot,
  type ConversationGoal,
  type DiscoveryKey,
  type EvidenceConfidence,
  type FactHook,
  type ObjectionRoute,
  type ValueFormula,
} from './types';

const GOALS = new Set<ConversationGoal>(CONVERSATION_GOALS.map((item) => item.key));
const MOMENTS = new Set<AccountMoment>(ACCOUNT_MOMENTS);
const CONFIDENCES = new Set<EvidenceConfidence>(EVIDENCE_CONFIDENCES);
const DISCOVERY_KEYS = new Set<DiscoveryKey>(DISCOVERY_CHECKLIST.map((item) => item.key));

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizeConversationGoal(value: unknown): ConversationGoal | null {
  return GOALS.has(value as ConversationGoal) ? value as ConversationGoal : null;
}

/**
 * O avanço padrão quando o vendedor não escolheu porta.
 *
 * Deriva do estágio do CRM pelo mesmo raciocínio de `inferMeetingKind`: quem ainda não
 * conversou precisa entender o momento; quem já tem proposta parada precisa destravar.
 */
export function inferConversationGoal(input: { stage?: string | null; hasConversation?: boolean }): ConversationGoal {
  const stage = String(input.stage || '');
  if (['proposta_enviada', 'negociacao', 'aguardando_aceite_vertho', 'contrato_enviado'].includes(stage)) {
    return 'destravar_decisao';
  }
  if (stage === 'cliente_ativo' || stage === 'ganho') return 'abrir_frente';
  if (stage === 'diagnostico_reuniao_realizada') return 'construir_valor';
  if (input.hasConversation) return 'confirmar_dor';
  return 'entender_momento';
}

/**
 * As descobertas que cada avanço precisa fechar.
 *
 * É o que faz a porta mudar a SAÍDA e não só o prompt: o banco de reserva sai ordenado
 * pelo que este avanço exige, então a pergunta certa está no topo quando a conversa foge
 * do roteiro. Porta que não muda saída nenhuma é só mais um campo.
 */
const GOAL_PRIORITY: Record<ConversationGoal, DiscoveryKey[]> = {
  entender_momento: ['situacao_atual', 'tentativas'],
  confirmar_dor: ['dor_principal', 'impacto'],
  construir_valor: ['criterio', 'orcamento'],
  destravar_decisao: ['decisor', 'prazo', 'criterio'],
  abrir_frente: ['situacao_atual', 'criterio'],
};

export function goalPriorityDiscoveries(goal: ConversationGoal): DiscoveryKey[] {
  return GOAL_PRIORITY[goal];
}

/**
 * Reordena o banco pelo avanço escolhido, sem descartar nada.
 *
 * Ordenação estável: entre perguntas de mesma prioridade a ordem original vale, então o
 * resultado continua sendo o do modelo, só que com o que este avanço exige na frente.
 */
export function sortQuestionsByGoal<T extends { discovery: DiscoveryKey | null }>(
  questions: T[],
  goal: ConversationGoal | null | undefined,
): T[] {
  if (!goal || !GOAL_PRIORITY[goal]) return questions;
  const priority = new Map(GOAL_PRIORITY[goal].map((key, index) => [key, index]));
  return questions
    .map((question, index) => ({ question, index }))
    .sort((a, b) => {
      const rankA = a.question.discovery ? priority.get(a.question.discovery) ?? 99 : 99;
      const rankB = b.question.discovery ? priority.get(b.question.discovery) ?? 99 : 99;
      return rankA - rankB || a.index - b.index;
    })
    .map((item) => item.question);
}

/**
 * Um item sem fonte nunca pode ser carimbado como confirmado.
 *
 * O rótulo existe para separar o que se afirma do que se pergunta; deixar o modelo
 * escolher sozinho devolveria "confirmado" para a leitura dele, que é justamente o que
 * a etiqueta deveria denunciar.
 */
export function normalizeConfidence(value: unknown, hasSource: boolean): EvidenceConfidence {
  const declared = CONFIDENCES.has(value as EvidenceConfidence) ? value as EvidenceConfidence : 'nao_confirmado';
  if (declared === 'confirmado' && !hasSource) return 'inferencia';
  return declared;
}

export function normalizeAccountSnapshot(value: unknown): AccountSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw: any = value;
  const size = text(raw.porte ?? raw.size, 400);
  const structure = text(raw.estrutura ?? raw.structure, 400);
  const criticalEvent = text(raw.evento_critico ?? raw.criticalEvent, 600);
  const momentBasis = text(raw.base_do_momento ?? raw.momentBasis, 600);
  // Retrato sem nenhum dos quatro campos e um cartao vazio na tela: melhor nao existir.
  if (!size && !structure && !criticalEvent && !momentBasis) return null;

  const sourceUrl = safeUrl(raw.fonte_url ?? raw.sourceUrl);
  const rawMoment = raw.momento ?? raw.moment;
  return {
    size: size || 'não encontrado',
    structure: structure || 'não encontrado',
    moment: MOMENTS.has(rawMoment as AccountMoment) ? rawMoment as AccountMoment : 'indefinido',
    momentBasis,
    criticalEvent,
    paceAdaptation: text(raw.adaptacao_pace ?? raw.paceAdaptation, 700),
    confidence: normalizeConfidence(raw.procedencia ?? raw.confidence, Boolean(sourceUrl)),
    sourceUrl,
  };
}

/**
 * A cadeia de cinco elos, ancorada num fato que existe.
 *
 * `factIndex` invalido derruba o gancho inteiro, pela mesma razao que derruba um opener:
 * gancho que cita um fato inexistente e uma alegacao sem base dita em voz alta.
 */
export function normalizeFactHooks(value: unknown, factsCount: number, limit = 3): FactHook[] {
  const hooks: FactHook[] = [];
  const usedFacts = new Set<number>();

  for (const raw of Array.isArray(value) ? value : []) {
    const rawIndex = (raw as any)?.fact_index ?? (raw as any)?.factIndex;
    if (!Number.isInteger(rawIndex) || Number(rawIndex) < 0 || Number(rawIndex) >= factsCount) continue;
    const factIndex = Number(rawIndex);
    if (usedFacts.has(factIndex)) continue;

    const implication = text((raw as any)?.implicacao ?? (raw as any)?.implication, 600);
    const askToTest = text((raw as any)?.pergunta ?? (raw as any)?.askToTest, 220);
    // Sem implicacao ou sem pergunta nao ha cadeia: sobra o fato cru, que ja existe.
    if (!implication || !askToTest) continue;

    hooks.push({
      factIndex,
      implication,
      hypothesis: text((raw as any)?.hipotese ?? (raw as any)?.hypothesis, 500),
      askToTest,
      bridgeIfConfirmed: text((raw as any)?.ponte ?? (raw as any)?.bridgeIfConfirmed, 600),
    });
    usedFacts.add(factIndex);
    if (hooks.length === limit) break;
  }

  return hooks;
}

export function normalizeObjectionRoutes(value: unknown, limit = 3): ObjectionRoute[] {
  const routes: ObjectionRoute[] = [];
  const seen = new Set<string>();

  for (const raw of Array.isArray(value) ? value : []) {
    const symptom = text((raw as any)?.sintoma ?? (raw as any)?.symptom, 400);
    const explore = text((raw as any)?.explorar ?? (raw as any)?.explore, 220);
    // A pergunta que explora e o unico passo obrigatorio: o fluxo do PACE proibe
    // responder a objecao antes de entender de onde ela vem.
    if (!symptom || !explore) continue;
    const chave = symptom.toLocaleLowerCase('pt-BR');
    if (seen.has(chave)) continue;

    routes.push({
      symptom,
      seat: text((raw as any)?.cadeira ?? (raw as any)?.seat, 120) || 'não identificada',
      cause: text((raw as any)?.causa ?? (raw as any)?.cause, 400),
      acknowledge: text((raw as any)?.acolher ?? (raw as any)?.acknowledge, 300),
      explore,
      // Vazio e um resultado legitimo: saber que nao temos prova vale mais que inventar uma.
      evidence: text((raw as any)?.evidencia ?? (raw as any)?.evidence, 600),
      alternative: text((raw as any)?.alternativa ?? (raw as any)?.alternative, 400),
      advance: text((raw as any)?.avancar ?? (raw as any)?.advance, 400),
    });
    seen.add(chave);
    if (routes.length === limit) break;
  }

  return routes;
}

export function normalizeValueMath(value: unknown, limit = 2): ValueFormula[] {
  const formulas: ValueFormula[] = [];

  for (const raw of Array.isArray(value) ? value : []) {
    const name = text((raw as any)?.nome ?? (raw as any)?.name, 160);
    const formula = text((raw as any)?.formula, 400);
    if (!name || !formula) continue;

    const known = (Array.isArray((raw as any)?.conhecidas) ? (raw as any).conhecidas : [])
      .map((item: any) => ({
        variable: text(item?.variavel ?? item?.variable, 160),
        value: text(item?.valor ?? item?.value, 160),
        confidence: normalizeConfidence(item?.procedencia ?? item?.confidence, Boolean(safeUrl(item?.fonte_url))),
      }))
      .filter((item: { variable: string; value: string }) => item.variable && item.value)
      .slice(0, 4);

    // Toda variavel aberta vira pergunta com chave de descoberta: e o que a coloca no
    // mesmo mecanismo que ja prioriza o banco durante a conversa.
    const open = (Array.isArray((raw as any)?.abertas) ? (raw as any).abertas : [])
      .map((item: any) => {
        const rawDiscovery = item?.descoberta ?? item?.discovery;
        return {
          variable: text(item?.variavel ?? item?.variable, 160),
          ask: text(item?.pergunta ?? item?.ask, 180),
          discovery: DISCOVERY_KEYS.has(rawDiscovery as DiscoveryKey) ? rawDiscovery as DiscoveryKey : null,
        };
      })
      .filter((item: { variable: string; ask: string }) => item.variable && item.ask)
      .slice(0, 5);

    // Formula sem nenhuma variavel aberta nao produz pergunta nenhuma na reuniao: ela e
    // uma conta que o copiloto fez sozinho, que e exatamente o que o PACE proibe.
    if (!open.length) continue;

    formulas.push({ name, formula, known, open });
    if (formulas.length === limit) break;
  }

  return formulas;
}
