'use server';

// Portal do Representante — contas (empresas do relacionamento comercial do RC).
//
// Regras de canal:
//   • RC só enxerga/edita as PRÓPRIAS contas (isolamento por representante_id).
//   • Admin comercial enxerga tudo em leitura (pode filtrar por representante).
//   • Carteira = contas cliente-ativo + fase de comissão derivada da vigência.
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  requireRepresentativeAction,
  requireRepresentativeOrAdminAction,
  requireCommercialAdminAction,
  assertRepresentativeOwnership,
} from '@/lib/sales/permissions';
import { numOrNull } from '@/lib/sales/validation';
import { logAdminAction } from '@/lib/audit';
import type { SalesAccount, SalesProposal } from '@/lib/sales/types';

const ACCOUNT_STATUSES = ['prospect', 'active_client', 'inactive', 'lost'] as const;
const CHURN_RISKS = ['baixo', 'medio', 'alto'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function listSalesAccounts(filters?: {
  status?: string;
  search?: string;
  representanteId?: string; // só admin pode usar (RC é sempre o próprio)
}) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  let q = sb.from('sales_accounts').select('*').order('legal_name');

  if (ctx.kind === 'representative') q = q.eq('representante_id', ctx.rep.id);
  else if (filters?.representanteId) q = q.eq('representante_id', filters.representanteId);

  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.search) {
    const term = filters.search.trim().replace(/[%_,()]/g, ' ');
    if (term) q = q.or(`legal_name.ilike.%${term}%,trade_name.ilike.%${term}%`);
  }

  const { data, error } = await q;
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: (data || []) as SalesAccount[] };
}

export async function getSalesAccount(accountId: string) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_accounts').select('*').eq('id', accountId).maybeSingle();
  if (error) return { success: false as const, error: error.message };
  if (!data) return { success: false as const, error: 'Conta não encontrada' };
  if (ctx.kind === 'representative' && data.representante_id !== ctx.rep.id) {
    return { success: false as const, error: 'FORBIDDEN: conta de outro representante' };
  }

  const [{ data: contacts }, { data: opportunities }, { data: followups }] = await Promise.all([
    sb.from('sales_contacts').select('*').eq('account_id', accountId).order('is_primary', { ascending: false }).order('name'),
    sb.from('sales_opportunities').select('id, opportunity_name, stage, status, estimated_value, origin').eq('account_id', accountId).order('updated_at', { ascending: false }),
    sb.from('sales_activity_notes').select('*').eq('account_id', accountId).order('created_at', { ascending: false }),
  ]);

  return {
    success: true as const,
    data: data as SalesAccount,
    contacts: contacts || [],
    opportunities: opportunities || [],
    followups: followups || [],
  };
}

/** Campos editáveis da conta (validação compartilhada create/update). */
function accountPatchFromInput(input: Record<string, any>): { patch: Record<string, any> } | { error: string } {
  const patch: Record<string, any> = {};
  const textFields = ['trade_name', 'cnpj', 'segment', 'city', 'state', 'notes'];
  for (const k of textFields) if (k in input) patch[k] = typeof input[k] === 'string' ? (input[k].trim() || null) : input[k] ?? null;
  for (const k of ['number_of_employees', 'number_of_units']) {
    if (k in input) {
      const n = numOrNull(input[k]);
      if (n != null && n < 0) return { error: 'Números não podem ser negativos' };
      patch[k] = n;
    }
  }
  return { patch };
}

export async function createSalesAccount(input: Record<string, any>) {
  const ctx = await requireRepresentativeAction();
  const legalName = String(input.legal_name || '').trim();
  if (!legalName) return { success: false as const, error: 'Razão social (legal_name) é obrigatória' };

  const parsed = accountPatchFromInput(input);
  if ('error' in parsed) return { success: false as const, error: parsed.error };

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_accounts').insert({
    representante_id: ctx.rep.id,
    legal_name: legalName,
    status: 'prospect',
    ...parsed.patch,
  }).select('*').single();
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: data as SalesAccount };
}

export async function updateSalesAccount(accountId: string, input: Record<string, any>) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: existing } = await sb.from('sales_accounts').select('id, representante_id').eq('id', accountId).maybeSingle();
  if (!existing) return { success: false as const, error: 'Conta não encontrada' };
  assertRepresentativeOwnership(ctx, existing.representante_id);

  const parsed = accountPatchFromInput(input);
  if ('error' in parsed) return { success: false as const, error: parsed.error };
  const patch = parsed.patch;

  if ('legal_name' in input) {
    const legalName = String(input.legal_name || '').trim();
    if (!legalName) return { success: false as const, error: 'Razão social (legal_name) é obrigatória' };
    patch.legal_name = legalName;
  }
  if ('status' in input) {
    if (!ACCOUNT_STATUSES.includes(input.status)) return { success: false as const, error: 'Status de conta inválido' };
    patch.status = input.status;
  }
  if ('churn_risk' in input) {
    if (input.churn_risk != null && !CHURN_RISKS.includes(input.churn_risk)) {
      return { success: false as const, error: 'Risco de churn inválido (baixo | medio | alto)' };
    }
    patch.churn_risk = input.churn_risk ?? null;
  }
  if ('renewal_date' in input) patch.renewal_date = input.renewal_date || null;
  if ('next_followup_date' in input) patch.next_followup_date = input.next_followup_date || null;
  if ('expansion_potential' in input) patch.expansion_potential = !!input.expansion_potential;

  patch.updated_at = new Date().toISOString();
  const { error } = await sb.from('sales_accounts').update(patch).eq('id', accountId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

/** Conta linhas de uma tabela ligadas à conta. Erro de leitura NÃO vira zero (E11). */
async function countByAccount(
  sb: ReturnType<typeof createSupabaseAdmin>,
  table: string,
  accountId: string,
): Promise<number> {
  const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true }).eq('account_id', accountId);
  if (error) throw new Error(`falha ao verificar ${table}: ${error.message}`);
  return count || 0;
}

export type SalesAccountVinculos = {
  opportunities: number;
  proposals: number;
  commissions: number;
  contacts: number;
  plans: number;
  conversations: number;
  notes: number;
  clienteAtivo: boolean;
};

/**
 * Os campos ausentes vêm declarados como `undefined` de propósito: o projeto
 * roda com `strict: false`, e ali união discriminada por booleano NÃO estreita
 * — sem isso, `result.error` depois de `if (!result.success)` não compila.
 */
export type DeleteSalesAccountResult =
  | { success: true; removed: SalesAccountVinculos; error?: undefined; precisaConfirmar?: undefined; vinculos?: undefined }
  /** `precisaConfirmar`: há histórico comercial e a chamada não veio com `forcar`. */
  | { success: false; error: string; precisaConfirmar?: boolean; vinculos?: SalesAccountVinculos; removed?: undefined };

/** Inventário do que está ligado à conta. Erro de leitura lança (E11). */
async function contarVinculos(
  sb: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  status: string,
): Promise<SalesAccountVinculos> {
  const [opportunities, proposals, commissions, contacts, plans, conversations, notes] = await Promise.all([
    countByAccount(sb, 'sales_opportunities', accountId),
    countByAccount(sb, 'sales_proposals', accountId),
    countByAccount(sb, 'sales_commission_events', accountId),
    countByAccount(sb, 'sales_contacts', accountId),
    countByAccount(sb, 'copilot_plans', accountId),
    countByAccount(sb, 'copilot_conversations', accountId),
    countByAccount(sb, 'sales_activity_notes', accountId),
  ]);
  return {
    opportunities, proposals, commissions, contacts, plans, conversations, notes,
    clienteAtivo: status === 'active_client',
  };
}

/** Funil ou carteira em jogo — o que faz a confirmação precisar ser explícita. */
function temHistoricoComercial(v: SalesAccountVinculos): boolean {
  return v.opportunities + v.proposals + v.commissions > 0 || v.clienteAtivo;
}

function contar(n: number, singular: string, plural: string): string {
  return n ? `${n} ${n === 1 ? singular : plural}` : '';
}

/**
 * Frase do que existe hoje ligado à conta — completa a pergunta da tela
 * ("Apagar “X”? …"), então lista o que some junto, do mais caro ao mais barato.
 */
function descreverVinculos(v: SalesAccountVinculos): string {
  const itens = [
    contar(v.commissions, 'evento de comissão', 'eventos de comissão'),
    contar(v.proposals, 'proposta', 'propostas'),
    contar(v.opportunities, 'oportunidade', 'oportunidades'),
    contar(v.plans, 'planejamento', 'planejamentos'),
    contar(v.conversations, 'resultado', 'resultados'),
    contar(v.contacts, 'contato', 'contatos'),
    contar(v.notes, 'nota', 'notas'),
  ].filter(Boolean);
  const ativo = v.clienteAtivo ? ' Ela está marcada como cliente ativo.' : '';
  if (!itens.length) return `Ela não tem nenhum registro ligado.${ativo} Não dá para desfazer.`;
  return `Vai junto: ${itens.join(', ')}.${ativo} Não dá para desfazer.`;
}

/**
 * O que está ligado a esta conta hoje — lido ANTES de perguntar se pode apagar,
 * para a confirmação dizer o que se perde em vez de descobrir depois.
 *
 * Leitura pura: mesmo gate da exclusão, nenhuma escrita.
 */
export async function getSalesAccountVinculos(accountId: string) {
  const ctx = await requireRepresentativeOrAdminAction();
  if (!UUID_RE.test(String(accountId || ''))) return { success: false as const, error: 'Empresa inválida' };

  const sb = createSupabaseAdmin();
  const { data: account, error: readError } = await sb.from('sales_accounts')
    .select('id, representante_id, status').eq('id', accountId).maybeSingle();
  if (readError) return { success: false as const, error: readError.message };
  if (!account) return { success: false as const, error: 'Conta não encontrada' };
  if (ctx.kind === 'representative' && account.representante_id !== ctx.rep.id) {
    return { success: false as const, error: 'FORBIDDEN: conta de outro representante' };
  }

  try {
    const vinculos = await contarVinculos(sb, accountId, account.status);
    return {
      success: true as const,
      vinculos,
      temHistorico: temHistoricoComercial(vinculos),
      resumo: descreverVinculos(vinculos),
    };
  } catch (err: any) {
    // Erro de leitura não pode virar "não tem nada ligado" (E11): quem confirma
    // decidiria às cegas achando que está informado.
    return { success: false as const, error: err?.message || 'Falha ao verificar o que está ligado à empresa' };
  }
}

/**
 * Apaga uma empresa do canal comercial (usado na lista do Copiloto).
 *
 * Duas etapas de propósito. Sem `forcar`, a conta com histórico comercial —
 * oportunidade, proposta, evento de comissão ou status de cliente ativo — NÃO
 * sai: a action devolve `precisaConfirmar` com o inventário, e a tela pergunta
 * de novo dizendo o que vai junto. Com `forcar`, apaga tudo.
 *
 * ⚠️ Apagar `sales_commission_events` deixa comissão paga ou prevista sem
 * lastro — o valor pago continua no extrato do RC sem a conta que o originou.
 * Por isso a exclusão forçada é registrada em `admin_audit_log` com o
 * inventário do que saiu (`sales_account.excluir`), antes que ele deixe de
 * existir para ser contado.
 *
 * A ordem do delete é ditada pelas FKs, e não é livre: comissões apontam para
 * propostas, propostas apontam para oportunidades, e só o que é acessório da
 * conta (contatos, planejamentos e conversas do copiloto) sai por CASCADE.
 */
export async function deleteSalesAccount(
  accountId: string,
  opts?: { forcar?: boolean },
): Promise<DeleteSalesAccountResult> {
  const ctx = await requireRepresentativeOrAdminAction();
  // Do lado admin isso é escrita destrutiva: exige sales_channel.manage (sócio não apaga).
  if (ctx.kind === 'admin') await requireCommercialAdminAction(true);
  if (!UUID_RE.test(String(accountId || ''))) return { success: false as const, error: 'Empresa inválida' };

  const sb = createSupabaseAdmin();
  const { data: account, error: readError } = await sb.from('sales_accounts')
    .select('id, representante_id, legal_name, trade_name, status').eq('id', accountId).maybeSingle();
  if (readError) return { success: false as const, error: readError.message };
  if (!account) return { success: false as const, error: 'Conta não encontrada' };
  if (ctx.kind === 'representative' && account.representante_id !== ctx.rep.id) {
    return { success: false as const, error: 'FORBIDDEN: conta de outro representante' };
  }

  // Contagem ANTES do delete: depois do cascade não há mais o que contar.
  const vinculos = await contarVinculos(sb, accountId, account.status);
  const temHistorico = temHistoricoComercial(vinculos);
  if (temHistorico && !opts?.forcar) {
    return { success: false as const, precisaConfirmar: true as const, vinculos, error: descreverVinculos(vinculos) };
  }

  // Ordem ditada pelas FKs: comissão → proposta → oportunidade. As notas com
  // opportunity_id caem por cascade da oportunidade; as soltas, por account_id.
  for (const tabela of ['sales_commission_events', 'sales_proposals', 'sales_activity_notes', 'sales_opportunities']) {
    const { error } = await sb.from(tabela).delete().eq('account_id', accountId);
    if (error) return { success: false as const, error: `Falha ao apagar ${tabela}: ${error.message}` };
  }

  const { error } = await sb.from('sales_accounts').delete().eq('id', accountId);
  if (error) return { success: false as const, error: error.message };

  if (temHistorico) {
    // Best-effort e depois do fato: o que se perde aqui não é recuperável, mas
    // o registro de QUEM apagou O QUÊ tem que sobreviver à conta.
    await logAdminAction({
      adminEmail: ctx.email,
      acao: 'sales_account.excluir',
      alvo: `${account.trade_name || account.legal_name} (${accountId})`,
      detalhes: { ...vinculos, forcado: true, status: account.status },
    });
  }

  return { success: true as const, removed: vinculos };
}

// ── Pós-venda / carteira (MVP 3) ────────────────────────────────────────────

const FOLLOWUP_KINDS = ['nota', 'followup', 'renovacao', 'risco', 'expansao'] as const;

/** Confirma que a conta é do RC do contexto e devolve o registro. */
async function ownAccount(sb: ReturnType<typeof createSupabaseAdmin>, ctx: any, accountId: string) {
  const { data } = await sb.from('sales_accounts').select('*').eq('id', accountId).maybeSingle();
  if (!data) return { error: 'Conta não encontrada' as const };
  if (data.representante_id !== ctx.rep.id) return { error: 'FORBIDDEN: conta de outro representante' as const };
  return { account: data as SalesAccount };
}

/** Registra um acompanhamento na timeline da conta (pós-venda). */
export async function addAccountFollowup(accountId: string, note: string, kind: string = 'followup') {
  const ctx = await requireRepresentativeAction();
  const text = String(note || '').trim();
  if (!text) return { success: false as const, error: 'Descreva o acompanhamento' };
  if (!FOLLOWUP_KINDS.includes(kind as any)) kind = 'followup';
  const sb = createSupabaseAdmin();
  const r = await ownAccount(sb, ctx, accountId);
  if ('error' in r) return { success: false as const, error: r.error };
  const { error } = await sb.from('sales_activity_notes').insert({
    representante_id: ctx.rep.id, account_id: accountId, opportunity_id: null,
    note: text, kind, created_by_email: ctx.email,
  });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

/** Define o risco de churn + registra na timeline (risco). */
export async function definirRiscoChurn(accountId: string, risco: 'baixo' | 'medio' | 'alto' | null, motivo?: string) {
  const ctx = await requireRepresentativeAction();
  if (risco != null && !CHURN_RISKS.includes(risco)) return { success: false as const, error: 'Risco inválido' };
  const sb = createSupabaseAdmin();
  const r = await ownAccount(sb, ctx, accountId);
  if ('error' in r) return { success: false as const, error: r.error };
  const { error } = await sb.from('sales_accounts')
    .update({ churn_risk: risco, updated_at: new Date().toISOString() }).eq('id', accountId);
  if (error) return { success: false as const, error: error.message };
  await sb.from('sales_activity_notes').insert({
    representante_id: ctx.rep.id, account_id: accountId, opportunity_id: null, kind: 'risco',
    note: `Risco de churn: ${risco ?? 'nenhum'}${motivo?.trim() ? ` — ${motivo.trim()}` : ''}`,
    created_by_email: ctx.email,
  });
  return { success: true as const };
}

/**
 * Cria uma oportunidade de EXPANSÃO a partir de uma conta ativa (upsell). Nova
 * oportunidade no funil (origem 'expansao'), pré-ligada à conta e ao contato
 * principal. Ao fechar/aceitar, segue a política de comissão do canal.
 */
export async function criarOportunidadeExpansao(accountId: string, nome?: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const r = await ownAccount(sb, ctx, accountId);
  if ('error' in r) return { success: false as const, error: r.error };
  const account = r.account;

  // contato principal (se houver) + produto da proposta aceita mais recente
  const [{ data: contato }, { data: prop }] = await Promise.all([
    sb.from('sales_contacts').select('id').eq('account_id', accountId).eq('is_primary', true).maybeSingle(),
    sb.from('sales_proposals').select('product_package').eq('account_id', accountId).eq('status', 'accepted').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const { computeProtectionWindow } = await import('@/lib/sales/protection');
  const protection = computeProtectionWindow(new Date());
  const nomeConta = account.trade_name || account.legal_name;
  const { data, error } = await sb.from('sales_opportunities').insert({
    representante_id: ctx.rep.id,
    account_id: accountId,
    primary_contact_id: contato?.id ?? null,
    opportunity_name: nome?.trim() || `Expansão — ${nomeConta}`,
    origin: 'expansao',
    product_interest: prop?.product_package ?? null,
    identified_need: 'Expansão/upsell de cliente ativo.',
    stage: 'lead_identificado',
    protection_start_date: protection.start,
    protection_end_date: protection.end,
    protection_status: 'active',
    status: 'open',
  }).select('id').single();
  if (error) return { success: false as const, error: error.message };

  await sb.from('sales_activity_notes').insert({
    representante_id: ctx.rep.id, account_id: accountId, opportunity_id: data.id, kind: 'expansao',
    note: 'Oportunidade de expansão aberta a partir da carteira.', created_by_email: ctx.email,
  });
  // marca a conta como tendo potencial de expansão (sinal na carteira)
  await sb.from('sales_accounts').update({ expansion_potential: true, updated_at: new Date().toISOString() }).eq('id', accountId);

  return { success: true as const, opportunityId: data.id };
}

export type PortfolioRow = {
  account: SalesAccount;
  product_package: string | null;
  monthly_value: number | null;
  contract_duration_months: number | null;
  contract_start_date: string | null;
  renewal_date: string | null;
  /** 12% durante a vigência inicial; 6% após (manutenção/renovação). */
  commission_phase: 'recorrente_12' | 'renovacao_6';
  churn_risk: SalesAccount['churn_risk'];
  expansion_potential: boolean;
  next_followup_date: string | null;
  /** dias até a renovação (negativo = vencida); null se sem data. */
  days_to_renewal: number | null;
};

function daysBetween(dateStr: string | null | undefined, today: Date): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  return Math.ceil((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

/** Carteira do RC: clientes ativos + dados da proposta aceita mais recente. */
export async function getPortfolio() {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();

  const [{ data: accounts, error: accErr }, { data: proposals, error: propErr }] = await Promise.all([
    sb.from('sales_accounts').select('*').eq('representante_id', ctx.rep.id).eq('status', 'active_client').order('legal_name'),
    sb.from('sales_proposals').select('*').eq('representante_id', ctx.rep.id).eq('status', 'accepted').order('created_at', { ascending: false }),
  ]);
  if (accErr) return { success: false as const, error: accErr.message };
  if (propErr) return { success: false as const, error: propErr.message };

  // Join manual: proposta aceita mais recente por conta (lista já ordenada desc).
  const latestByAccount = new Map<string, SalesProposal>();
  for (const p of (proposals || []) as SalesProposal[]) {
    if (p.account_id && !latestByAccount.has(p.account_id)) latestByAccount.set(p.account_id, p);
  }

  const today = new Date();
  const rows: PortfolioRow[] = ((accounts || []) as SalesAccount[]).map((account) => {
    const proposal = latestByAccount.get(account.id) ?? null;
    const startDate = account.contract_start_date;
    const months = proposal?.contract_duration_months != null ? Number(proposal.contract_duration_months) : null;

    // Fase de comissão: 12% enquanto hoje < início + vigência; depois 6%.
    let phase: PortfolioRow['commission_phase'] = 'recorrente_12';
    if (startDate && months) {
      const end = new Date(`${startDate.slice(0, 10)}T00:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + months);
      if (today.getTime() >= end.getTime()) phase = 'renovacao_6';
    }

    return {
      account,
      product_package: proposal?.product_package ?? null,
      monthly_value: proposal?.monthly_value ?? null,
      contract_duration_months: months,
      contract_start_date: startDate,
      renewal_date: account.renewal_date,
      commission_phase: phase,
      churn_risk: account.churn_risk,
      expansion_potential: !!account.expansion_potential,
      next_followup_date: account.next_followup_date,
      days_to_renewal: daysBetween(account.renewal_date, today),
    };
  });

  return { success: true as const, rows };
}

/** Visão de canal da carteira (admin): clientes ativos + renovações + risco por RC. */
export async function getPortfolioAdmin(filters?: { representanteId?: string }) {
  const { requireCommercialAdminAction } = await import('@/lib/sales/permissions');
  await requireCommercialAdminAction(false);
  const sb = createSupabaseAdmin();
  let q = sb.from('sales_accounts')
    .select('*, representante:sales_representatives (id, name)')
    .eq('status', 'active_client').order('renewal_date', { ascending: true, nullsFirst: false });
  if (filters?.representanteId) q = q.eq('representante_id', filters.representanteId);
  const { data, error } = await q;
  if (error) return { success: false as const, error: error.message };
  const today = new Date();
  const rows = (data || []).map((a: any) => ({
    account: a as SalesAccount,
    repName: a.representante?.name ?? '—',
    churn_risk: a.churn_risk,
    expansion_potential: !!a.expansion_potential,
    renewal_date: a.renewal_date,
    days_to_renewal: daysBetween(a.renewal_date, today),
  }));
  const totals = {
    clientesAtivos: rows.length,
    renovacoesProximas: rows.filter((r) => r.days_to_renewal != null && r.days_to_renewal >= 0 && r.days_to_renewal <= 90).length,
    riscoAlto: rows.filter((r) => r.churn_risk === 'alto').length,
    comExpansao: rows.filter((r) => r.expansion_potential).length,
  };
  return { success: true as const, rows, totals };
}
