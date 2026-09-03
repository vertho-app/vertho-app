export const PACE_PHASES = ['preparar', 'analisar', 'cocriar', 'engajar'] as const;
export type PacePhase = (typeof PACE_PHASES)[number];

export const MEETING_KINDS = [
  { key: 'primeira_conversa', label: 'Primeira conversa' },
  { key: 'retorno', label: 'Retorno' },
  { key: 'demonstracao', label: 'Demonstração' },
  { key: 'negociacao', label: 'Negociação' },
] as const;

export type MeetingKind = (typeof MEETING_KINDS)[number]['key'];

/**
 * O avanço que esta conversa precisa produzir.
 *
 * É a decisão que roteia o planejamento inteiro: o que a pesquisa prioriza, o que o
 * Play enfatiza e qual compromisso é o padrão. O tipo da reunião continua existindo,
 * mas é inferido pelo estágio do CRM (`inferMeetingKind`) e sai da frente.
 */
export const CONVERSATION_GOALS = [
  { key: 'entender_momento', label: 'Entender o momento', hint: 'ainda não sei o suficiente para propor' },
  { key: 'confirmar_dor', label: 'Confirmar a dor e o custo', hint: 'sei o problema, falta dimensionar' },
  { key: 'construir_valor', label: 'Construir o valor', hint: 'preciso justificar o investimento' },
  { key: 'destravar_decisao', label: 'Destravar a decisão', hint: 'parou em alguém ou em alguma coisa' },
  { key: 'abrir_frente', label: 'Abrir a próxima frente', hint: 'já é cliente, quero mais território' },
] as const;

export type ConversationGoal = (typeof CONVERSATION_GOALS)[number]['key'];

/**
 * Separa o que se pode afirmar do que ainda precisa virar pergunta.
 *
 * `nao_confirmado` não é ausência de dado: é um item que o vendedor deve levar para a
 * conversa como pergunta, nunca como frase de abertura.
 */
export const EVIDENCE_CONFIDENCES = ['confirmado', 'inferencia', 'nao_confirmado'] as const;
export type EvidenceConfidence = (typeof EVIDENCE_CONFIDENCES)[number];

export const ACCOUNT_MOMENTS = [
  'expansao', 'pos_aquisicao', 'pressao_de_custo', 'troca_de_lideranca',
  'transformacao', 'crise', 'indefinido',
] as const;
export type AccountMoment = (typeof ACCOUNT_MOMENTS)[number];

export const DISCOVERY_CHECKLIST = [
  { key: 'situacao_atual', label: 'Como funciona hoje' },
  { key: 'dor_principal', label: 'O que mais incomoda' },
  { key: 'impacto', label: 'Quanto custa esse problema' },
  { key: 'tentativas', label: 'O que já tentaram' },
  { key: 'criterio', label: 'Como vão decidir' },
  { key: 'decisor', label: 'Quem decide junto' },
  { key: 'orcamento', label: 'Verba e ordem de grandeza' },
  { key: 'prazo', label: 'Urgência e janela' },
] as const;

export type DiscoveryKey = (typeof DISCOVERY_CHECKLIST)[number]['key'];

export type CopilotOpportunity = {
  id: string;
  accountId: string;
  name: string;
  accountName: string;
  segment: string | null;
  context: string;
  stage: string;
  primaryContact: string;
};

export type CopilotAccountStatus = 'prospect' | 'active_client' | 'inactive' | 'lost';

export type CopilotAccountListItem = {
  id: string;
  name: string;
  legalName: string;
  status: CopilotAccountStatus;
  segment: string | null;
  city: string | null;
  state: string | null;
  representativeName: string | null;
  conversationCount: number;
  lastConversationAt: string | null;
  planningCount: number;
  lastPlanningAt: string | null;
  openOpportunityCount: number;
  currentStage: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
};

export type CopilotConversationSource = 'paste' | 'whisper_local' | 'supernormal' | 'manual';
// Fonte única passou a ser lib/status.ts (nono domínio, 28/08): o union de
// literais aqui derrubava o status-literal-guard em arquivo novo.
import type { CopilotEvolutionStatus } from '@/lib/status';
export type { CopilotEvolutionStatus };

export type CopilotAccountMemory = {
  situation: string[];
  pains: string[];
  impacts: string[];
  attempts: string[];
  decisionCriteria: string[];
  stakeholders: string[];
  budget: string[];
  timing: string[];
  objections: string[];
  commitments: string[];
  nextStep: string;
  /**
   * A resposta da Pergunta-Âncora, nas palavras do cliente.
   *
   * Guardada literal de propósito: a paráfrase troca o vocabulário dele pelo do produto,
   * e é a frase dele que faz o follow-up soar como continuação da conversa.
   * Optional so conversations analyzed before the anchor rollout remain readable.
   */
  anchorAnswers?: string[];
};

export type CopilotConversationAnalysis = {
  paceCoverage: DiscoveryKey[];
  memory: CopilotAccountMemory;
  evolution: Array<{
    status: CopilotEvolutionStatus;
    text: string;
    evidence: string;
  }>;
};

export type CopilotConversation = {
  id: string;
  accountId: string;
  opportunityId: string | null;
  title: string;
  happenedAt: string;
  source: CopilotConversationSource;
  transcript: string;
  summary: string;
  analysis: CopilotConversationAnalysis;
  createdByEmail: string;
  createdAt: string;
};

export type CopilotPlanInputs = {
  company: string;
  site: string;
  socialProfiles: string;
  context: string;
  offer: string;
  opportunityId: string;
  /** Optional so plans saved before the meeting-play rollout remain readable. */
  meetingKind?: MeetingKind;
  audience?: string;
  goalThisHour?: string;
  /** O avanço escolhido na entrada. Optional pelo mesmo motivo. */
  conversationGoal?: ConversationGoal;
};

export type CopilotSavedPlan = {
  id: string;
  accountId: string;
  opportunityId: string | null;
  conversationId: string | null;
  plan: CopilotPlan;
  inputs: CopilotPlanInputs;
  createdByEmail: string;
  createdAt: string;
};

export type CopilotAccountDetail = {
  account: {
    id: string;
    name: string;
    legalName: string;
    status: CopilotAccountStatus;
    segment: string | null;
    city: string | null;
    state: string | null;
    notes: string | null;
  };
  contacts: Array<{
    id: string;
    name: string;
    role: string | null;
    email: string | null;
    phone: string | null;
    isPrimary: boolean;
  }>;
  opportunities: Array<{
    id: string;
    name: string;
    stage: string;
    status: string;
    identifiedNeed: string | null;
    nextAction: string | null;
    nextActionDate: string | null;
  }>;
  plans: CopilotSavedPlan[];
  conversations: CopilotConversation[];
};

export type ResearchFact = {
  title: string;
  fact: string;
  relevance: string;
  sourceUrl: string | null;
  publishedAt: string | null;
};

export type ResearchTrend = {
  title: string;
  impact: string;
  sourceUrl: string | null;
};

export type PlanningHypothesis = {
  hypothesis: string;
  basis: string;
  howToTest: string;
};

export type PaceQuestion = {
  phase: PacePhase;
  discovery: DiscoveryKey | null;
  text: string;
  why: string;
};

export type LikelyObjection = {
  objection: string;
  question: string;
};

/**
 * Porte e momento da conta: o que decide ticket, formato e quem assina.
 *
 * Era prosa livre dentro de `companySummary`, que nem chegava à conversa. Cada linha
 * carrega o próprio rótulo de procedência porque faturamento e headcount são exatamente
 * os campos que um modelo preenche plausível quando não acha.
 */
export type AccountSnapshot = {
  size: string;
  structure: string;
  moment: AccountMoment;
  momentBasis: string;
  criticalEvent: string;
  /** Como o PACE muda para esta conta: transacional ou estratégica, e a cadeira na sala. */
  paceAdaptation: string;
  confidence: EvidenceConfidence;
  sourceUrl: string | null;
};

/**
 * A cadeia do slide 30, com a hipótese do meio.
 *
 * O último elo é CONDICIONAL de propósito: mencionar a Vertho antes de a hipótese ser
 * confirmada é o pitch de elevador que o slide 63 manda evitar.
 */
export type FactHook = {
  /** Índice em `plan.facts`. */
  factIndex: number;
  implication: string;
  hypothesis: string;
  askToTest: string;
  /** Só se dizer em voz alta depois que a hipótese for confirmada. */
  bridgeIfConfirmed: string;
};

/**
 * O fluxo do slide 98 inteiro, e não só a pergunta que abre.
 *
 * `evidence` aceita vazio: saber que não temos prova para uma objeção antes de entrar
 * vale mais do que uma prova inventada na hora.
 */
export type ObjectionRoute = {
  symptom: string;
  /** De quem é a objeção: financeiro, RH, operações, TI, patrocinador. */
  seat: string;
  cause: string;
  acknowledge: string;
  explore: string;
  evidence: string;
  alternative: string;
  advance: string;
};

/**
 * O cálculo que o cliente preenche, não o que o copiloto estima.
 *
 * Cada variável desconhecida vira uma pergunta com chave de descoberta, então ela entra
 * no mesmo mecanismo que já prioriza o banco durante a conversa.
 */
export type ValueFormula = {
  name: string;
  formula: string;
  known: Array<{ variable: string; value: string; confidence: EvidenceConfidence }>;
  open: Array<{ variable: string; ask: string; discovery: DiscoveryKey | null }>;
};

export type CopilotPlay = {
  kind: MeetingKind;
  audience: string;
  goalThisHour: string;
  /**
   * O avanço que ainda salva a reunião quando o objetivo principal não sai.
   * Optional so plans saved before the fallback-goal rollout remain readable.
   */
  fallbackGoal?: string;
  /**
   * A pergunta que precisa sair respondida, nas palavras do cliente.
   *
   * A resposta é capturada literal na memória da conta e alimenta o follow-up e o
   * planejamento seguinte. Optional pelo mesmo motivo de compatibilidade.
   */
  anchorQuestion?: string;
  openers: Array<{
    say: string;
    /** Index in plan.facts; null means the opener is grounded in the private briefing. */
    factIndex: number | null;
  }>;
  mustAsk: Array<{
    text: string;
    discovery: DiscoveryKey | null;
    green: string;
    red: string;
    ifGreen: string;
  }>;
  doNot: string[];
  closeWith: string;
  landmine: {
    objection: string;
    ask: string;
  };
};

/**
 * Quem responde por pessoas e formação na organização.
 *
 * A trilha parte da ORGANIZAÇÃO, não do nome: antes da primeira reunião o
 * vendedor costuma não saber com quem vai falar, e é justamente aí que a
 * pergunta "quem decide isso aqui" vale mais. Só atuação profissional pública
 * entra; nada de vida pessoal, opinião fora do trabalho ou inferência sobre
 * personalidade — isso viraria dossiê de pessoa, que não é o que o Play precisa.
 *
 * `verifiable` marca a fonte que NÓS não conseguimos reabrir para conferir.
 * Medido em 02/09: o buscador lê o perfil do LinkedIn pelo índice, e a mesma URL
 * devolve bloqueio para leitura direta. O vendedor abre no navegador; a
 * plataforma não revalida.
 */
export type MeetingPerson = {
  name: string;
  role: string;
  /** O que a pessoa defende publicamente, em uma frase, com base na fonte. */
  publicStance: string;
  sourceUrl: string | null;
  confidence: EvidenceConfidence;
  verifiable: boolean;
};

export type CopilotSourceKind = 'site' | 'news' | 'social';

export type CopilotSource = {
  title: string;
  url: string;
  /** Optional only to keep plans already saved in localStorage readable. */
  kind?: CopilotSourceKind;
};

export type CopilotPlan = {
  companyIdentified: string;
  companySummary: string;
  valueSummary: string;
  facts: ResearchFact[];
  trends: ResearchTrend[];
  hypotheses: PlanningHypothesis[];
  objectives: { primary: string; fallback: string };
  roiMetrics: Array<{ metric: string; howToMeasure: string }>;
  strategicQuestions: string[];
  questions: PaceQuestion[];
  objections: LikelyObjection[];
  risks: string[];
  gaps: DiscoveryKey[];
  /**
   * Estruturas da ficha (rollout de 01/09). Todas opcionais para que os planos já
   * salvos em localStorage e em `copilot_plans` sigam legíveis.
   */
  goal?: ConversationGoal;
  snapshot?: AccountSnapshot;
  hooks?: FactHook[];
  objectionRoutes?: ObjectionRoute[];
  valueMath?: ValueFormula[];
  /** Quem responde por pessoas na organização. Só quando a trilha é pedida. */
  people?: MeetingPerson[];
  /** Missing only in plans created before the meeting-play rollout. */
  play?: CopilotPlay;
  sources: CopilotSource[];
  researchAudit?: {
    site: {
      status: 'not_requested' | 'found' | 'none' | 'unavailable';
      signalsFound: number;
    };
    news: {
      status: 'not_requested' | 'found' | 'none' | 'unavailable';
      signalsFound: number;
    };
    social: {
      status: 'not_requested' | 'found' | 'none' | 'unavailable';
      profilesConsulted: number;
      signalsFound: number;
    };
    /** Optional só para os planos salvos antes desta trilha existir. */
    people?: {
      status: 'not_requested' | 'found' | 'none' | 'unavailable';
      signalsFound: number;
    };
  };
  researchedAt: string;
};

export type LiveUtterance = {
  channel: 'cliente' | 'vendedor';
  text: string;
  at: number;
};

export type LiveReading = {
  phase: PacePhase;
  covered: DiscoveryKey[];
  pending: Array<{ key: DiscoveryKey; label: string }>;
  signal: 'objecao' | 'sinal_de_compra' | 'duvida' | 'abertura' | 'neutro';
  objection: string | null;
  alert: string | null;
  focus: string;
  questions: Array<{ text: string; why: string }>;
};

export type SupernormalPost = {
  id: string;
  title: string;
  publishedAt: string;
  summary: string;
  seen: boolean;
};

export type SupernormalPostDetail = SupernormalPost & {
  notes: Array<{ body: string; displayName: string; type: string }>;
  transcript: Array<{ start: number; end: number; content: string; authorName: string }>;
};

export const DEFAULT_VERTHO_OFFER =
  'Programas de desenvolvimento de competências com IA para empresas e escolas: diagnóstico por cargo e de competências, PDI, trilhas personalizadas com microlearning e prática no trabalho, acompanhamento pelo Mentor IA no WhatsApp e relatórios de evolução para RH e gestores. Formatos: diagnóstico, piloto, onboarding, Mentor IA e programas customizados.';
