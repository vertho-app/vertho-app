'use server';

// Portal do Representante — propostas com aprovação interna Vertho.
//
// Máquina de estados:
//   draft → submitted_for_approval → approved → sent_to_client → accepted
//                    ↘ changes_requested → (RC edita) → submitted_for_approval
//                    ↘ rejected                       accepted/sent → lost
//
// Regras: RC cria/edita rascunho e submete; NUNCA aprova a própria proposta.
// Só admin (sales_channel.manage) aprova/recusa/pede ajustes. Financeiro é
// SEMPRE recalculado no server (lib/sales/commissions) — nunca confiamos no valor do client.
//
// Contrato de representação v6 (23/10/2026): a proposta só é submetida com o
// registro da oportunidade validado (7.1, na hora ou pela fila); a aprovação grava
// o modelo de remuneração que vale para ela (10.5) e a classificação de cliente
// da carteira (10.6); o aceite lança a comissão nas regras gravadas. Proposta
// criada, submetida ou enviada é movimentação e renova a proteção (7.5).
import { createSupabaseAdmin } from '@/lib/supabase';
import { isPlatformAdmin } from '@/lib/authz';
import {
  requireRepresentativeAction,
  requireRepresentativeOrAdminAction,
  requireCommercialAdminAction,
  assertRepresentativeOwnership,
} from '@/lib/sales/permissions';
import { validateProposalDraft, validateProposalForSubmission, numOrNull } from '@/lib/sales/validation';
import { calculateProposalFinancials } from '@/lib/sales/commissions';
import { commissionRatesFor, type CompensationModel } from '@/lib/sales/constants';
import { classificarCarteira, comissaoDevidaNoAceite, concluirAceiteDoRC } from '@/lib/sales/aceite-rc';
import { conferirRegistro, registrarMovimentacao } from '@/lib/sales/registro';
import { dataBRT } from '@/lib/dre/semana';
import type { SalesProposal } from '@/lib/sales/types';

const PROPOSAL_SELECT = `*,
  account:sales_accounts (id, legal_name, trade_name),
  opportunity:sales_opportunities (id, opportunity_name, stage, attribution_status),
  representante:sales_representatives (id, name, status, compensation_model, contract_ended_at)`;

const RC_EDITABLE_STATUSES = ['draft', 'changes_requested'];

const MSG_REGISTRO_NAO_VALIDADO =
  'A vertho.ai ainda não validou o registro desta oportunidade (cláusula 7.1 do contrato). A proposta pode ser submetida depois da validação.';

/**
 * Financeiro e regras de comissão que a proposta grava. `modelo` é o do RC dono
 * da proposta e `carteira` a classificação da 10.6: o RC com ajuda de custo não
 * tem comissão de aquisição, o cliente da carteira paga a metade, e a estimativa
 * gravada tem que dizer isso.
 */
function proposalPatchFromInput(
  input: Record<string, any>,
  modelo: CompensationModel,
  carteira: { carteira: boolean; motivo: string | null },
): Record<string, any> {
  const patch: Record<string, any> = {
    customer_type: input.customer_type || null,
    number_of_users: numOrNull(input.number_of_users),
    number_of_roles_mapped: numOrNull(input.number_of_roles_mapped),
    product_package: input.product_package || null,
    contract_duration_months: numOrNull(input.contract_duration_months),
    discount_requested: numOrNull(input.discount_requested),
    payment_terms: input.payment_terms?.trim() || null,
    included_scope: input.included_scope?.trim() || null,
    commercial_notes: input.commercial_notes?.trim() || null,
    monthly_value: numOrNull(input.monthly_value),
  };
  // Financeiro derivado no server — fonte única.
  const fin = calculateProposalFinancials({
    monthly_value: patch.monthly_value,
    contract_duration_months: patch.contract_duration_months,
    discount_requested: patch.discount_requested,
  }, commissionRatesFor(modelo), carteira.carteira);
  return { ...patch, ...fin, compensation_model: modelo, carteira: carteira.carteira, carteira_motivo: carteira.motivo };
}

const MSG_CLIENTE_COM_OUTRO =
  'A proteção desta oportunidade acabou (90 dias sem movimentação) e o cliente está agora com outro representante (cláusula 7.6). A proposta não segue.';

/**
 * O registro da oportunidade foi validado pela vertho.ai (7.1) e o cliente
 * ainda é do RC? Devolve o motivo de NÃO seguir, ou `null` quando pode. Sem
 * oportunidade, não pode; falha de leitura também não vira "validado".
 *
 * Proteção vencida (7.6): o cliente ficou livre. Se outro RC o pegou, a proposta
 * de quem o perdeu não é submetida nem aprovada; se ninguém pegou, segue (e a
 * submissão, como movimentação, renova a proteção).
 */
async function bloqueioDoRegistro(
  sb: ReturnType<typeof createSupabaseAdmin>,
  opportunityId: string | null | undefined,
  { semOportunidadePassa = false }: { semOportunidadePassa?: boolean } = {},
): Promise<string | null> {
  // Envio e aceite de proposta antiga sem oportunidade (antes do contrato v5) seguem.
  if (!opportunityId) return semOportunidadePassa ? null : MSG_REGISTRO_NAO_VALIDADO;
  const { data, error } = await sb.from('sales_opportunities')
    .select('attribution_status, representante_id, protection_end_date, account:sales_accounts (cnpj, codigo_inep)')
    .eq('id', opportunityId).maybeSingle();
  if (error) return `Não foi possível conferir o registro da oportunidade: ${error.message}`;
  if (data?.attribution_status !== 'validada') return MSG_REGISTRO_NAO_VALIDADO;
  if (!data.protection_end_date || data.protection_end_date >= dataBRT(new Date())) return null;
  const conta: any = Array.isArray(data.account) ? data.account[0] : data.account;
  try {
    const c = await conferirRegistro(sb, { representanteId: data.representante_id, cnpj: conta?.cnpj, codigoInep: conta?.codigo_inep });
    if (c.livre) return null;
    return c.motivo === 'reserva'
      ? 'A proteção desta oportunidade acabou (90 dias sem movimentação) e o cliente agora precisa da conferência da vertho.ai (cláusula 7.3).'
      : MSG_CLIENTE_COM_OUTRO;
  } catch (e: any) {
    return `Não foi possível conferir se o cliente segue livre: ${e?.message || 'erro de leitura'}`;
  }
}

/**
 * Modelo e carteira que o resumo financeiro do RC deve usar enquanto ele digita
 * a proposta de uma oportunidade. A fonte de verdade continua sendo o servidor
 * no salvamento e, de vez, na aprovação.
 */
export async function getTermosDeComissao(opportunityId: string | null) {
  const ctx = await requireRepresentativeAction();
  const modelo = (ctx.rep.compensation_model || 'sem_ajuda') as CompensationModel;
  if (!opportunityId) return { success: true as const, modelo, carteira: false, motivo: null };
  const sb = createSupabaseAdmin();
  const { data: opp, error } = await sb.from('sales_opportunities').select('representante_id, account_id').eq('id', opportunityId).maybeSingle();
  if (error) return { success: false as const, error: error.message };
  if (!opp) return { success: false as const, error: 'Oportunidade não encontrada' };
  assertRepresentativeOwnership(ctx, opp.representante_id);
  const c = await classificarCarteira(sb, { representanteId: ctx.rep.id, accountId: opp.account_id });
  return { success: true as const, modelo, carteira: c.carteira, motivo: c.motivo };
}

export async function listProposals(
  filters?: { status?: string; representanteId?: string },
  visao?: 'canal',
) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  // `visao: 'canal'` é pedido pela página /admin/comercial/propostas. O parâmetro
  // escolhe a VISÃO; a IDENTIDADE decide se pode — RC puro pedindo 'canal' leva
  // FORBIDDEN. Sem ele, quem tem linha em sales_representatives é classificado
  // como RC (requireRepresentativeOrAdminAction dá precedência ao RC) e veria só
  // as próprias propostas mesmo estando na tela de canal.
  const canal = visao === 'canal';
  if (canal && !(await isPlatformAdmin(ctx.email))) {
    return { success: false as const, error: 'FORBIDDEN: visão do canal é só de platform admin' };
  }
  // Canal: admin puro (sem linha de RC) ou platform admin que pediu o canal.
  // RC: quem tem linha de RC e não pediu o canal — o portal dele segue escopado.
  const visaoCanal = canal || ctx.kind === 'admin';
  let q = sb.from('sales_proposals').select(PROPOSAL_SELECT).order('created_at', { ascending: false });
  if (!visaoCanal && ctx.kind === 'representative') q = q.eq('representante_id', ctx.rep.id);
  else if (visaoCanal && filters?.representanteId) q = q.eq('representante_id', filters.representanteId);
  if (filters?.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: (data || []) as SalesProposal[] };
}

export async function getProposal(proposalId: string) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_proposals').select(PROPOSAL_SELECT).eq('id', proposalId).maybeSingle();
  if (error) return { success: false as const, error: error.message };
  if (!data) return { success: false as const, error: 'Proposta não encontrada' };
  // Platform admin é admin do canal MESMO quando também tem linha em
  // sales_representatives: requireRepresentativeOrAdminAction dá precedência ao
  // RC, mas a visão dele aqui é a do canal. Sem isso, um admin+RC não abria
  // NENHUMA proposta que não fosse sua — desde a mig 254, nenhuma do deal desk
  // (representante_id NULL não casa com id nenhum) — e não via os comentários
  // internos. Anti-IDOR preservado: RC que não é platform admin segue trancado.
  const ehAdmin = ctx.kind === 'admin' || (await isPlatformAdmin(ctx.email));
  if (ctx.kind === 'representative' && !ehAdmin && data.representante_id !== ctx.rep.id) {
    return { success: false as const, error: 'FORBIDDEN: proposta de outro representante' };
  }
  // Comentários internos só para admin.
  let comments: any[] = [];
  if (ehAdmin) {
    const { data: c } = await sb.from('sales_admin_comments').select('*').eq('proposal_id', proposalId).order('created_at', { ascending: false });
    comments = c || [];
  }
  return { success: true as const, data: data as SalesProposal, comments };
}

export async function createProposalDraft(input: Record<string, any>) {
  const ctx = await requireRepresentativeAction();
  const v = validateProposalDraft(input);
  if (!v.valid) return { success: false as const, error: 'Dados inválidos', fieldErrors: v.errors };

  const sb = createSupabaseAdmin();
  const { data: opp } = await sb.from('sales_opportunities')
    .select('id, representante_id, account_id, status').eq('id', input.opportunity_id).maybeSingle();
  if (!opp) return { success: false as const, error: 'Oportunidade não encontrada' };
  assertRepresentativeOwnership(ctx, opp.representante_id);
  if (opp.status !== 'open') return { success: false as const, error: 'Oportunidade fechada não recebe novas propostas' };

  const carteira = await classificarCarteira(sb, { representanteId: ctx.rep.id, accountId: opp.account_id });
  const { data: num, error: numErr } = await sb.rpc('sales_next_proposal_number');
  if (numErr) return { success: false as const, error: `Falha ao gerar número: ${numErr.message}` };

  const { data, error } = await sb.from('sales_proposals').insert({
    representante_id: ctx.rep.id,
    opportunity_id: opp.id,
    account_id: opp.account_id,
    proposal_number: num as string,
    status: 'draft',
    ...proposalPatchFromInput(input, ctx.rep.compensation_model, carteira),
  }).select('id').single();
  if (error) return { success: false as const, error: error.message };
  await registrarMovimentacao(sb, opp.id);
  return { success: true as const, id: data.id };
}

export async function updateProposalDraft(proposalId: string, input: Record<string, any>) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: existing, error: erroLeitura } = await sb.from('sales_proposals').select('id, representante_id, account_id, status').eq('id', proposalId).maybeSingle();
  if (erroLeitura) return { success: false as const, error: erroLeitura.message };
  if (!existing) return { success: false as const, error: 'Proposta não encontrada' };
  assertRepresentativeOwnership(ctx, existing.representante_id);
  if (!RC_EDITABLE_STATUSES.includes(existing.status)) {
    return { success: false as const, error: 'Proposta só pode ser editada em rascunho ou com ajustes solicitados' };
  }
  const v = validateProposalDraft({ ...input, opportunity_id: 'ok' });
  if (!v.valid) return { success: false as const, error: 'Dados inválidos', fieldErrors: v.errors };

  const carteira = await classificarCarteira(sb, { representanteId: ctx.rep.id, accountId: existing.account_id, excluirProposalId: proposalId });
  const { error } = await sb.from('sales_proposals')
    .update({ ...proposalPatchFromInput(input, ctx.rep.compensation_model, carteira), updated_at: new Date().toISOString() })
    .eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

export async function submitProposalForApproval(proposalId: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: p, error: erroLeitura } = await sb.from('sales_proposals').select('*').eq('id', proposalId).maybeSingle();
  if (erroLeitura) return { success: false as const, error: erroLeitura.message };
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  assertRepresentativeOwnership(ctx, p.representante_id);
  if (!RC_EDITABLE_STATUSES.includes(p.status)) return { success: false as const, error: 'Proposta não está em estado submetível' };

  const v = validateProposalForSubmission(p);
  if (!v.valid) return { success: false as const, error: 'Complete a proposta antes de submeter', fieldErrors: v.errors };
  const bloqueio = await bloqueioDoRegistro(sb, p.opportunity_id);
  if (bloqueio) return { success: false as const, error: bloqueio };

  const { error } = await sb.from('sales_proposals')
    .update({ status: 'submitted_for_approval', rejection_reason: null, updated_at: new Date().toISOString() })
    .eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };

  // Reflete no funil: proposta em aprovação interna. O funil é rastro; a falha vai para o log.
  if (p.opportunity_id) {
    const { error: erroFunil } = await sb.from('sales_opportunities')
      .update({ stage: 'aguardando_aceite_vertho', updated_at: new Date().toISOString() })
      .eq('id', p.opportunity_id).eq('status', 'open');
    if (erroFunil) console.error('[sales] estágio da oportunidade não atualizado:', erroFunil.message);
    await registrarMovimentacao(sb, p.opportunity_id);
  }
  return { success: true as const };
}

// ── Ações do admin (aprovação interna) ──────────────────────────────────────

/**
 * Aprova e CONGELA as regras de comissão da proposta: o modelo de remuneração
 * do RC neste momento (10.5: vale o modelo vigente na aprovação) e a
 * classificação de cliente da carteira (10.6). A carteira vem calculada (a conta
 * já tem proposta aceita do RC); o admin confirma ou corrige, com motivo,
 * porque grupo econômico e mantenedora só ele enxerga.
 */
export async function approveProposal(
  proposalId: string,
  decisao?: { carteira?: boolean; motivo?: string | null; pagamentos?: number | null; primeiroPagamentoEmMeses?: number | null },
) {
  const admin = await requireCommercialAdminAction();
  const sb = createSupabaseAdmin();
  const { data: p, error: erroLeitura } = await sb.from('sales_proposals').select('*').eq('id', proposalId).maybeSingle();
  if (erroLeitura) return { success: false as const, error: erroLeitura.message };
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  if (p.status !== 'submitted_for_approval') return { success: false as const, error: 'Só propostas aguardando aprovação podem ser aprovadas' };
  if (!p.representante_id) return { success: false as const, error: 'Proposta sem representante segue o fluxo do deal desk' };
  const bloqueio = await bloqueioDoRegistro(sb, p.opportunity_id);
  if (bloqueio) return { success: false as const, error: bloqueio };

  const { data: rep, error: erroRc } = await sb.from('sales_representatives').select('compensation_model').eq('id', p.representante_id).maybeSingle();
  if (erroRc) return { success: false as const, error: erroRc.message };
  if (!rep) return { success: false as const, error: 'Representante da proposta não encontrado' };

  const automatica = await classificarCarteira(sb, { representanteId: p.representante_id, accountId: p.account_id, excluirProposalId: p.id });
  const carteira = typeof decisao?.carteira === 'boolean' ? decisao.carteira : automatica.carteira;
  const observacao = decisao?.motivo?.trim() || null;
  if (carteira !== automatica.carteira && !observacao) {
    return {
      success: false as const,
      error: carteira
        ? 'Explique por que o cliente é da carteira (grupo econômico, mantenedora ou cliente já atribuído ao RC).'
        : 'Explique por que esta proposta não é de cliente da carteira, se a conta já tem proposta aceita do RC.',
    };
  }
  const motivo = observacao
    ? `Classificação do admin (${admin.email}): ${observacao}`
    : automatica.motivo;

  // Cronograma do cliente (10.2 e 10.3): quantos pagamentos e em que mês sai o 1º.
  // A comissão continua por Parcela Mensal Equivalente; muda só QUANDO ela é devida.
  const vigencia = Number(p.contract_duration_months) || 0;
  const pagamentos = decisao?.pagamentos == null ? null : Number(decisao.pagamentos);
  if (pagamentos != null && (!Number.isInteger(pagamentos) || pagamentos < 1 || pagamentos > Math.max(1, vigencia))) {
    return { success: false as const, error: `O número de pagamentos do cliente vai de 1 (à vista) a ${vigencia} (um por mês).` };
  }
  const atraso = decisao?.primeiroPagamentoEmMeses == null ? 0 : Number(decisao.primeiroPagamentoEmMeses);
  if (!Number.isInteger(atraso) || atraso < 0 || atraso > 24) {
    return { success: false as const, error: 'O 1º pagamento do cliente vai de 0 a 24 meses depois do aceite.' };
  }

  const agora = new Date().toISOString();
  const { error } = await sb.from('sales_proposals').update({
    ...proposalPatchFromInput(p, rep.compensation_model as CompensationModel, { carteira, motivo }),
    payment_count: pagamentos != null && pagamentos < vigencia ? pagamentos : null,
    first_payment_offset_months: atraso,
    status: 'approved', approved_by: admin.email, approved_at: agora,
    rejection_reason: null, updated_at: agora,
  }).eq('id', proposalId).eq('status', 'submitted_for_approval');
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

export async function rejectProposal(proposalId: string, reason: string) {
  const admin = await requireCommercialAdminAction();
  if (!reason?.trim()) return { success: false as const, error: 'Informe o motivo da recusa' };
  const sb = createSupabaseAdmin();
  const { data: p } = await sb.from('sales_proposals').select('id, status').eq('id', proposalId).maybeSingle();
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  if (p.status !== 'submitted_for_approval') return { success: false as const, error: 'Só propostas aguardando aprovação podem ser recusadas' };
  const { error } = await sb.from('sales_proposals').update({
    status: 'rejected', rejection_reason: reason.trim(), approved_by: admin.email, updated_at: new Date().toISOString(),
  }).eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

export async function requestProposalChanges(proposalId: string, comment: string) {
  const admin = await requireCommercialAdminAction();
  if (!comment?.trim()) return { success: false as const, error: 'Descreva os ajustes solicitados' };
  const sb = createSupabaseAdmin();
  const { data: p } = await sb.from('sales_proposals').select('id, status').eq('id', proposalId).maybeSingle();
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  if (p.status !== 'submitted_for_approval') return { success: false as const, error: 'Só propostas aguardando aprovação podem receber ajustes' };
  const { error } = await sb.from('sales_proposals').update({
    status: 'changes_requested', rejection_reason: comment.trim(), updated_at: new Date().toISOString(),
  }).eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };
  await sb.from('sales_admin_comments').insert({ proposal_id: proposalId, author_email: admin.email, comment: comment.trim() });
  return { success: true as const };
}

export async function addAdminComment(proposalId: string, comment: string) {
  const admin = await requireCommercialAdminAction();
  if (!comment?.trim()) return { success: false as const, error: 'Comentário vazio' };
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('sales_admin_comments').insert({ proposal_id: proposalId, author_email: admin.email, comment: comment.trim() });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

// ── Pós-aprovação (RC) ──────────────────────────────────────────────────────

export async function markProposalSentToClient(proposalId: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: p } = await sb.from('sales_proposals').select('id, representante_id, status, opportunity_id').eq('id', proposalId).maybeSingle();
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  assertRepresentativeOwnership(ctx, p.representante_id);
  if (p.status !== 'approved') return { success: false as const, error: 'Só propostas aprovadas pela Vertho podem ser enviadas ao cliente' };
  // Registro revogado ou cliente perdido pela 7.6 depois da aprovação: a proposta não sai.
  const bloqueio = await bloqueioDoRegistro(sb, p.opportunity_id, { semOportunidadePassa: true });
  if (bloqueio) return { success: false as const, error: bloqueio };
  // `sent_to_client_at` é o marco da 18.7: proposta enviada antes do término do
  // contrato do RC e aceita dentro da validade continua comissionada.
  const agora = new Date().toISOString();
  const { error } = await sb.from('sales_proposals').update({ status: 'sent_to_client', sent_to_client_at: agora, updated_at: agora }).eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };
  if (p.opportunity_id) {
    const { error: erroFunil } = await sb.from('sales_opportunities').update({ stage: 'contrato_enviado', updated_at: new Date().toISOString() })
      .eq('id', p.opportunity_id).eq('status', 'open');
    if (erroFunil) console.error('[sales] estágio da oportunidade não atualizado:', erroFunil.message);
    await registrarMovimentacao(sb, p.opportunity_id);
  }
  return { success: true as const };
}

/**
 * Nova versão de uma proposta já aprovada/enviada: cria uma CÓPIA editável
 * (draft, número -Rn) que segue de novo pelo fluxo (aprovação → reenvio). A
 * original vira 'superseded' (histórico). Vínculo por version + supersedes_id.
 */
export async function revisarProposta(proposalId: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: p, error: erroLeitura } = await sb.from('sales_proposals').select('*').eq('id', proposalId).maybeSingle();
  if (erroLeitura) return { success: false as const, error: erroLeitura.message };
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  assertRepresentativeOwnership(ctx, p.representante_id);
  if (!['approved', 'sent_to_client'].includes(p.status)) {
    return { success: false as const, error: 'Só dá para revisar propostas aprovadas ou já enviadas ao cliente.' };
  }

  const newVersion = (Number(p.version) || 1) + 1;
  const base = String(p.proposal_number).replace(/-R\d+$/, '');
  const newNumber = `${base}-R${newVersion}`;

  // A nova versão volta a ser estimativa: modelo atual do RC e carteira
  // recalculada. A aprovação dela congela de novo (10.5).
  const carteira = await classificarCarteira(sb, { representanteId: ctx.rep.id, accountId: p.account_id, excluirProposalId: p.id });
  const modelo = (ctx.rep.compensation_model || 'sem_ajuda') as CompensationModel;
  const fin = calculateProposalFinancials({
    monthly_value: p.monthly_value,
    contract_duration_months: p.contract_duration_months,
    discount_requested: p.discount_requested,
  }, commissionRatesFor(modelo), carteira.carteira);

  const { data: nova, error } = await sb.from('sales_proposals').insert({
    representante_id: p.representante_id,
    opportunity_id: p.opportunity_id,
    account_id: p.account_id,
    proposal_number: newNumber,
    version: newVersion,
    supersedes_id: p.id,
    customer_type: p.customer_type,
    number_of_users: p.number_of_users,
    number_of_roles_mapped: p.number_of_roles_mapped,
    product_package: p.product_package,
    contract_duration_months: p.contract_duration_months,
    discount_requested: p.discount_requested,
    payment_terms: p.payment_terms,
    included_scope: p.included_scope,
    commercial_notes: p.commercial_notes,
    monthly_value: p.monthly_value,
    ...fin,
    compensation_model: modelo,
    carteira: carteira.carteira,
    carteira_motivo: carteira.motivo,
    status: 'draft',
  }).select('id').single();
  if (error) return { success: false as const, error: error.message };

  await sb.from('sales_proposals').update({ status: 'superseded', updated_at: new Date().toISOString() }).eq('id', p.id);
  await registrarMovimentacao(sb, p.opportunity_id);

  return { success: true as const, proposalId: nova.id };
}

/**
 * Aceite do cliente, registrado pelo RC: fecha a oportunidade como ganha, ativa
 * a conta na carteira e lança a comissão prevista nas regras GRAVADAS na
 * proposta (modelo da aprovação e carteira), pelo núcleo `concluirAceiteDoRC`.
 */
export async function markProposalAccepted(proposalId: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: p, error: erroLeitura } = await sb.from('sales_proposals').select('*').eq('id', proposalId).maybeSingle();
  if (erroLeitura) return { success: false as const, error: erroLeitura.message };
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  assertRepresentativeOwnership(ctx, p.representante_id);
  if (p.status !== 'sent_to_client') return { success: false as const, error: 'Só propostas enviadas ao cliente podem ser marcadas como aceitas' };
  const bloqueio = await bloqueioDoRegistro(sb, p.opportunity_id, { semOportunidadePassa: true });
  if (bloqueio) return { success: false as const, error: bloqueio };

  const r = await concluirAceiteDoRC(sb, p, { modeloAtualDoRc: ctx.rep.compensation_model, comComissao: true });
  return 'error' in r ? { success: false as const, error: r.error } : { success: true as const };
}

/**
 * Aceite de proposta de RC registrado pela vertho.ai: o cliente aceitou por
 * fora (e-mail, assinatura) ou o RC não está mais no canal. É o caminho que a
 * cláusula 18.7 precisa: com o contrato do RC encerrado, a proposta ENVIADA
 * antes do término e aceita dentro da validade continua comissionada; a que
 * não cumpre isso é aceita sem comissão, e o motivo fica registrado.
 */
export async function registrarAceitePropostaDoRC(proposalId: string) {
  const admin = await requireCommercialAdminAction();
  const sb = createSupabaseAdmin();
  const { data: p, error: erroLeitura } = await sb.from('sales_proposals').select('*').eq('id', proposalId).maybeSingle();
  if (erroLeitura) return { success: false as const, error: erroLeitura.message };
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  if (!p.representante_id) return { success: false as const, error: 'Proposta sem representante: use o aceite do deal desk' };
  if (p.status !== 'sent_to_client') return { success: false as const, error: 'Só propostas enviadas ao cliente podem ser marcadas como aceitas' };

  const { data: rep, error: erroRc } = await sb.from('sales_representatives')
    .select('status, compensation_model, contract_ended_at').eq('id', p.representante_id).maybeSingle();
  if (erroRc) return { success: false as const, error: erroRc.message };
  if (!rep) return { success: false as const, error: 'Representante da proposta não encontrado' };
  const bloqueio = await bloqueioDoRegistro(sb, p.opportunity_id, { semOportunidadePassa: true });
  if (bloqueio) return { success: false as const, error: bloqueio };

  const direito = comissaoDevidaNoAceite(rep, p);
  const r = await concluirAceiteDoRC(sb, p, { modeloAtualDoRc: rep.compensation_model, comComissao: direito.devida });
  if ('error' in r) return { success: false as const, error: r.error };

  // A nota é rastro: o aceite já foi gravado, a falha dela vai para o log.
  const { error: erroNota } = await sb.from('sales_activity_notes').insert({
    representante_id: p.representante_id, opportunity_id: p.opportunity_id, account_id: p.account_id,
    note: `Aceite da proposta ${p.proposal_number} registrado pela vertho.ai. ${direito.devida ? 'Comissão prevista lançada.' : 'Sem comissão.'}${direito.motivo ? ` ${direito.motivo}` : ''}`,
    created_by_email: admin.email,
  });
  if (erroNota) console.error('[sales] nota do aceite não gravada:', erroNota.message);
  return { success: true as const, comComissao: direito.devida, motivo: direito.motivo };
}

/** Proposta perdida (aceita/enviada que não evoluiu). */
export async function markProposalLost(proposalId: string, reason?: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: p } = await sb.from('sales_proposals').select('id, representante_id, status').eq('id', proposalId).maybeSingle();
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  assertRepresentativeOwnership(ctx, p.representante_id);
  if (!['approved', 'sent_to_client'].includes(p.status)) return { success: false as const, error: 'Estado atual não permite marcar como perdida' };
  const { error } = await sb.from('sales_proposals').update({
    status: 'lost', rejection_reason: reason?.trim() || null, updated_at: new Date().toISOString(),
  }).eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}
