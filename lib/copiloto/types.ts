export const PACE_PHASES = ['preparar', 'analisar', 'cocriar', 'engajar'] as const;
export type PacePhase = (typeof PACE_PHASES)[number];

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
  name: string;
  accountName: string;
  segment: string | null;
  context: string;
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
  sources: Array<{ title: string; url: string }>;
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
