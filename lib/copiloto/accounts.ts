import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase';
import { COPILOTO_EVOLUCAO } from '@/lib/status';
import type { CopilotAccess } from './auth';
import type {
  CopilotAccountDetail,
  CopilotAccountListItem,
  CopilotAccountMemory,
  CopilotConversation,
  CopilotConversationAnalysis,
  CopilotConversationSource,
  CopilotEvolutionStatus,
  CopilotPlan,
  CopilotPlanInputs,
  CopilotSavedPlan,
  DiscoveryKey,
} from './types';
import { DISCOVERY_CHECKLIST } from './types';
import { normalizeMeetingKind } from './play';

const EMPTY_MEMORY: CopilotAccountMemory = {
  situation: [], pains: [], impacts: [], attempts: [], decisionCriteria: [], stakeholders: [],
  budget: [], timing: [], objections: [], commitments: [], nextStep: '',
};

const DISCOVERY_KEYS = new Set(DISCOVERY_CHECKLIST.map((item) => item.key));
const EVOLUTION_STATUSES = new Set<CopilotEvolutionStatus>(Object.values(COPILOTO_EVOLUCAO));
const SOURCES = new Set<CopilotConversationSource>(['paste', 'whisper_local', 'supernormal', 'manual']);

function shortText(value: unknown, max = 800): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function textList(value: unknown, maxItems = 8): string[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => shortText(item, 500))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function normalizeConversationAnalysis(value: unknown): CopilotConversationAnalysis {
  const raw: any = value && typeof value === 'object' ? value : {};
  const memory = raw.memory && typeof raw.memory === 'object' ? raw.memory : {};
  return {
    paceCoverage: (Array.isArray(raw.paceCoverage) ? raw.paceCoverage : [])
      .filter((item: unknown): item is DiscoveryKey => typeof item === 'string' && DISCOVERY_KEYS.has(item as DiscoveryKey)),
    memory: {
      situation: textList(memory.situation),
      pains: textList(memory.pains),
      impacts: textList(memory.impacts),
      attempts: textList(memory.attempts),
      decisionCriteria: textList(memory.decisionCriteria),
      stakeholders: textList(memory.stakeholders),
      budget: textList(memory.budget),
      timing: textList(memory.timing),
      objections: textList(memory.objections),
      commitments: textList(memory.commitments),
      nextStep: shortText(memory.nextStep, 600),
      // Literal de proposito: a parafrase troca o vocabulario do cliente pelo do produto.
      anchorAnswers: textList(memory.anchorAnswers),
    },
    evolution: (Array.isArray(raw.evolution) ? raw.evolution : []).map((item: any) => ({
      status: EVOLUTION_STATUSES.has(item?.status) ? item.status as CopilotEvolutionStatus : COPILOTO_EVOLUCAO.PENDENTE,
      text: shortText(item?.text, 600),
      evidence: shortText(item?.evidence, 500),
    })).filter((item: { text: string }) => item.text).slice(0, 12),
  };
}

export function normalizeConversationRow(row: any): CopilotConversation {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    opportunityId: row.opportunity_id ? String(row.opportunity_id) : null,
    title: shortText(row.title, 180) || 'Conversa comercial',
    happenedAt: String(row.happened_at || row.created_at),
    source: SOURCES.has(row.source) ? row.source as CopilotConversationSource : 'manual',
    transcript: typeof row.transcript === 'string' ? row.transcript : '',
    summary: shortText(row.summary, 2400),
    analysis: normalizeConversationAnalysis(row.analysis),
    createdByEmail: shortText(row.created_by_email, 320),
    createdAt: String(row.created_at || row.happened_at),
  };
}

export function normalizePlanRow(row: any): CopilotSavedPlan {
  const inputs = row?.inputs && typeof row.inputs === 'object' ? row.inputs : {};
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    opportunityId: row.opportunity_id ? String(row.opportunity_id) : null,
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    plan: (row?.plan && typeof row.plan === 'object' ? row.plan : {}) as CopilotPlan,
    inputs: {
      company: shortText(inputs.company, 240),
      site: shortText(inputs.site, 1000),
      socialProfiles: shortText(inputs.socialProfiles, 5000),
      context: shortText(inputs.context, 30000),
      offer: shortText(inputs.offer, 12000),
      opportunityId: shortText(inputs.opportunityId, 60),
      meetingKind: normalizeMeetingKind(inputs.meetingKind) || undefined,
      audience: shortText(inputs.audience, 1000),
      goalThisHour: shortText(inputs.goalThisHour, 1200),
    } satisfies CopilotPlanInputs,
    createdByEmail: shortText(row.created_by_email, 320),
    createdAt: String(row.created_at),
  };
}

export type CopilotPlanningMemory = {
  hasConversations: boolean;
  covered: DiscoveryKey[];
  pending: DiscoveryKey[];
  nextStep: string;
  pains: string[];
  objections: string[];
  commitments: string[];
  /** Respostas da Pergunta-Âncora, nas palavras do cliente, das conversas anteriores. */
  anchorAnswers: string[];
};

function uniqueText(values: unknown[], maxItems = 8): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = shortText(value, 500);
    const key = item.toLocaleLowerCase('pt-BR');
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length === maxItems) break;
  }
  return result;
}

export function compactCopilotPlanningMemory(rows: unknown): CopilotPlanningMemory {
  const conversations = Array.isArray(rows) ? rows : [];
  const analyses = conversations.map((row: any) => row?.analysis && typeof row.analysis === 'object' ? row.analysis : {});
  const covered = DISCOVERY_CHECKLIST.map((item) => item.key).filter((key) =>
    analyses.some((analysis: any) => Array.isArray(analysis.paceCoverage) && analysis.paceCoverage.includes(key)));
  const memories = analyses.map((analysis: any) => analysis.memory && typeof analysis.memory === 'object' ? analysis.memory : {});
  return {
    hasConversations: conversations.length > 0,
    covered,
    pending: DISCOVERY_CHECKLIST.map((item) => item.key).filter((key) => !covered.includes(key)),
    nextStep: memories.map((memory: any) => shortText(memory.nextStep, 600)).find(Boolean) || '',
    pains: uniqueText(memories.flatMap((memory: any) => Array.isArray(memory.pains) ? memory.pains : [])),
    objections: uniqueText(memories.flatMap((memory: any) => Array.isArray(memory.objections) ? memory.objections : [])),
    commitments: uniqueText(memories.flatMap((memory: any) => Array.isArray(memory.commitments) ? memory.commitments : [])),
    anchorAnswers: uniqueText(memories.flatMap((memory: any) => Array.isArray(memory.anchorAnswers) ? memory.anchorAnswers : []), 4),
  };
}

export function formatCopilotPlanningMemory(memory: CopilotPlanningMemory): string {
  return [
    `coberto: ${memory.covered.length ? memory.covered.join(', ') : 'nenhuma chave confirmada'}`,
    `pendente: ${memory.pending.length ? memory.pending.join(', ') : 'nenhuma chave pendente'}`,
    `proximo_passo_anterior: ${memory.nextStep || 'não registrado'}`,
    `dores: ${memory.pains.length ? memory.pains.join(' | ') : 'não registradas'}`,
    `objecoes: ${memory.objections.length ? memory.objections.join(' | ') : 'não registradas'}`,
    `combinados: ${memory.commitments.length ? memory.commitments.join(' | ') : 'não registrados'}`,
    `nas_palavras_dele: ${memory.anchorAnswers.length ? memory.anchorAnswers.join(' | ') : 'não registrado'}`,
  ].join('\n');
}

export async function getCopilotPlanningMemory(
  access: CopilotAccess,
  accountId: string,
): Promise<CopilotPlanningMemory | null> {
  const account = await findCopilotAccount(access, accountId);
  if (!account) return null;
  const { data, error } = await createSupabaseAdmin().from('copilot_conversations')
    .select('analysis')
    .eq('account_id', accountId)
    .order('happened_at', { ascending: false })
    .limit(50);
  if (error) throw new Error('falha ao ler memória da conta: ' + error.message);
  return compactCopilotPlanningMemory(data || []);
}

function accountQueryFor(access: CopilotAccess) {
  const sb = createSupabaseAdmin();
  let query = sb.from('sales_accounts').select(
    'id, representante_id, legal_name, trade_name, segment, city, state, notes, status, updated_at',
  );
  if (access.kind === 'representative') query = query.eq('representante_id', access.rep.id);
  return { sb, query };
}

export async function findCopilotAccount(access: CopilotAccess, accountId: string): Promise<any | null> {
  const { query } = accountQueryFor(access);
  const { data } = await query.eq('id', accountId).maybeSingle();
  return data || null;
}

export async function listCopilotAccounts(access: CopilotAccess): Promise<CopilotAccountListItem[]> {
  const { sb, query } = accountQueryFor(access);
  const { data: accountRows, error } = await query.order('updated_at', { ascending: false }).limit(200);
  if (error || !accountRows?.length) return [];

  const accountIds = accountRows.map((row: any) => row.id);
  const repIds = [...new Set(accountRows.map((row: any) => row.representante_id).filter(Boolean))];
  const [{ data: opportunityRows }, { data: conversationRows }, { data: planRows }, { data: repRows }] = await Promise.all([
    sb.from('sales_opportunities')
      .select('account_id, stage, status, next_action, next_action_date, updated_at')
      .in('account_id', accountIds)
      .eq('status', 'open')
      .order('updated_at', { ascending: false }),
    sb.from('copilot_conversations')
      .select('account_id, happened_at')
      .in('account_id', accountIds)
      .order('happened_at', { ascending: false })
      .limit(5000),
    sb.from('copilot_plans')
      .select('account_id, created_at')
      .in('account_id', accountIds)
      .order('created_at', { ascending: false })
      .limit(5000),
    repIds.length
      ? sb.from('sales_representatives').select('id, name').in('id', repIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const reps = new Map((repRows || []).map((row: any) => [row.id, row.name]));
  const opportunities = new Map<string, any[]>();
  for (const row of opportunityRows || []) {
    const list = opportunities.get(row.account_id) || [];
    list.push(row);
    opportunities.set(row.account_id, list);
  }
  const conversations = new Map<string, { count: number; latest: string | null }>();
  for (const row of conversationRows || []) {
    const current = conversations.get(row.account_id) || { count: 0, latest: null };
    current.count += 1;
    if (!current.latest) current.latest = row.happened_at;
    conversations.set(row.account_id, current);
  }
  const plans = new Map<string, { count: number; latest: string | null }>();
  for (const row of planRows || []) {
    const current = plans.get(row.account_id) || { count: 0, latest: null };
    current.count += 1;
    if (!current.latest) current.latest = row.created_at;
    plans.set(row.account_id, current);
  }

  return accountRows.map((row: any) => {
    const accountOpportunities = opportunities.get(row.id) || [];
    const latestOpportunity = accountOpportunities[0] || null;
    const conversation = conversations.get(row.id) || { count: 0, latest: null };
    const planning = plans.get(row.id) || { count: 0, latest: null };
    return {
      id: row.id,
      name: row.trade_name || row.legal_name,
      legalName: row.legal_name,
      status: row.status,
      segment: row.segment || null,
      city: row.city || null,
      state: row.state || null,
      representativeName: reps.get(row.representante_id) || null,
      conversationCount: conversation.count,
      lastConversationAt: conversation.latest,
      planningCount: planning.count,
      lastPlanningAt: planning.latest,
      openOpportunityCount: accountOpportunities.length,
      currentStage: latestOpportunity?.stage || null,
      nextAction: latestOpportunity?.next_action || null,
      nextActionDate: latestOpportunity?.next_action_date || null,
    } satisfies CopilotAccountListItem;
  });
}

export async function getCopilotAccountDetail(
  access: CopilotAccess,
  accountId: string,
): Promise<CopilotAccountDetail | null> {
  const account = await findCopilotAccount(access, accountId);
  if (!account) return null;
  const sb = createSupabaseAdmin();
  const [{ data: contacts }, { data: opportunities }, { data: plans }, { data: conversations }] = await Promise.all([
    sb.from('sales_contacts').select('id, name, role, email, phone, is_primary')
      .eq('account_id', accountId).order('is_primary', { ascending: false }).order('name'),
    sb.from('sales_opportunities')
      .select('id, opportunity_name, stage, status, identified_need, next_action, next_action_date')
      .eq('account_id', accountId).order('updated_at', { ascending: false }),
    sb.from('copilot_plans').select('*')
      .eq('account_id', accountId).order('created_at', { ascending: false }).limit(50),
    sb.from('copilot_conversations').select('*')
      .eq('account_id', accountId).order('happened_at', { ascending: false }).limit(50),
  ]);

  return {
    account: {
      id: account.id,
      name: account.trade_name || account.legal_name,
      legalName: account.legal_name,
      status: account.status,
      segment: account.segment || null,
      city: account.city || null,
      state: account.state || null,
      notes: account.notes || null,
    },
    contacts: (contacts || []).map((row: any) => ({
      id: row.id, name: row.name, role: row.role || null, email: row.email || null,
      phone: row.phone || null, isPrimary: !!row.is_primary,
    })),
    opportunities: (opportunities || []).map((row: any) => ({
      id: row.id, name: row.opportunity_name, stage: row.stage, status: row.status,
      identifiedNeed: row.identified_need || null, nextAction: row.next_action || null,
      nextActionDate: row.next_action_date || null,
    })),
    plans: (plans || []).map(normalizePlanRow),
    conversations: (conversations || []).map(normalizeConversationRow),
  };
}

export { EMPTY_MEMORY };
