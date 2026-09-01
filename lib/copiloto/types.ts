export const PACE_PHASES = ['preparar', 'analisar', 'cocriar', 'engajar'] as const;
export type PacePhase = (typeof PACE_PHASES)[number];

export const MEETING_KINDS = [
  { key: 'primeira_conversa', label: 'Primeira conversa' },
  { key: 'retorno', label: 'Retorno' },
  { key: 'demonstracao', label: 'Demonstração' },
  { key: 'negociacao', label: 'Negociação' },
] as const;

export type MeetingKind = (typeof MEETING_KINDS)[number]['key'];

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

export type CopilotPlay = {
  kind: MeetingKind;
  audience: string;
  goalThisHour: string;
  /**
   * O avanço que ainda salva a reunião quando o objetivo principal não sai.
   * Optional so plans saved before the fallback-goal rollout remain readable.
   */
  fallbackGoal?: string;
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
