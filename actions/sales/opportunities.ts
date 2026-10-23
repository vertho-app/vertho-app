'use server';

// Portal do Representante — oportunidades (núcleo do CRM).
//
// Regras de canal (contrato de representação v6, cláusula 7ª):
//   • RC só enxerga/edita as PRÓPRIAS oportunidades (isolamento por representante_id).
//   • O registro exige os campos do Anexo III, inclusive CNPJ da conta e cargo do contato (7.2).
//   • Cliente livre (CNPJ básico e INEP fora de outro RC e da lista de reserva) é
//     aceito na hora; o resto nasce 'aguardando' e a vertho.ai valida ou recusa no
//     /admin/comercial (7.1, 7.3). Regra em lib/sales/registro.ts.
//   • A proteção vale até a última movimentação + 90 dias (7.5): contato
//     registrado, mudança de estágio, proposta criada, submetida ou enviada.
//   • Edição só enquanto aberta; fechamento via moveOpportunityStage.
//   • quality_score persiste a completude (base do pipeline qualificado).
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  requireRepresentativeAction,
  requireRepresentativeOrAdminAction,
  requireCommercialAdminAction,
  assertRepresentativeOwnership,
} from '@/lib/sales/permissions';
import { validateOpportunityInput, numOrNull } from '@/lib/sales/validation';
import { calculateQualityScore } from '@/lib/sales/quality-score';
import { computeProtectionStatus, protectionAlertLabel } from '@/lib/sales/protection';
import { groupByStage, oportunidadesSemProximaAcao, pipelinePonderado, pipelineQualificado, pipelineTotal } from '@/lib/sales/kpis';
import { PIPELINE_STAGES, STAGE_LABELS, type PipelineStage } from '@/lib/sales/constants';
import { normalizarCnpj } from '@/lib/sales/duplicidade';
import {
  CANAIS_DE_CONTATO,
  CANAL_LABELS,
  DECISOR_AUTOMATICO,
  JANELA_REVOGACAO_DIAS,
  dataCurtaBRT,
  decidirRegistro,
  diasSemMovimento,
  precisaDeMovimentacao,
  protecaoAPartirDe,
  reconferirRegistroAceito,
  revogavel,
  registrarMovimentacao,
  type CanalDeContato,
} from '@/lib/sales/registro';
import type { SalesOpportunity } from '@/lib/sales/types';
import { escaparLike } from '@/lib/sql-like';
import { dataBRT } from '@/lib/dre/semana';

const OPP_SELECT = `*,
  account:sales_accounts (id, legal_name, trade_name, segment, city, state),
  primary_contact:sales_contacts!sales_opportunities_primary_contact_id_fkey (id, name, role, email, phone)`;

/** Recalcula e persiste protection_status derivado (idempotente, barato). */
function withDerivedProtection(o: any): SalesOpportunity {
  const derived = computeProtectionStatus(o.protection_end_date, o.protection_status);
  return { ...o, protection_status: derived } as SalesOpportunity;
}

export async function listOpportunities(filters?: {
  representanteId?: string;   // só admin pode usar (RC é sempre o próprio)
  stage?: string;
  protectionStatus?: string;
  productInterest?: string;
  status?: string;
  search?: string;
}) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  let q = sb.from('sales_opportunities').select(OPP_SELECT).order('updated_at', { ascending: false });

  if (ctx.kind === 'representative') q = q.eq('representante_id', ctx.rep.id);
  else if (filters?.representanteId) q = q.eq('representante_id', filters.representanteId);

  if (filters?.stage) q = q.eq('stage', filters.stage);
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.productInterest) q = q.eq('product_interest', filters.productInterest);
  if (filters?.search) q = q.ilike('opportunity_name', `%${escaparLike(filters.search)}%`);

  const { data, error } = await q;
  if (error) return { success: false as const, error: error.message };

  let list = (data || []).map(withDerivedProtection);
  if (filters?.protectionStatus) list = list.filter((o) => o.protection_status === filters.protectionStatus);
  return { success: true as const, data: list };
}

export async function getOpportunity(opportunityId: string) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_opportunities').select(OPP_SELECT).eq('id', opportunityId).maybeSingle();
  if (error) return { success: false as const, error: error.message };
  if (!data) return { success: false as const, error: 'Oportunidade não encontrada' };
  if (ctx.kind === 'representative' && data.representante_id !== ctx.rep.id) {
    return { success: false as const, error: 'FORBIDDEN: registro de outro representante' };
  }

  const [{ data: proposals }, { data: notes }] = await Promise.all([
    sb.from('sales_proposals').select('id, proposal_number, status, monthly_value, total_contract_value, estimated_total_commission, created_at').eq('opportunity_id', opportunityId).order('created_at', { ascending: false }),
    sb.from('sales_activity_notes').select('*').eq('opportunity_id', opportunityId).order('created_at', { ascending: false }),
  ]);

  return { success: true as const, data: withDerivedProtection(data), proposals: proposals || [], notes: notes || [] };
}

/** Score usa o cargo do contato principal — busca quando houver contato. */
async function scoreFor(sb: ReturnType<typeof createSupabaseAdmin>, row: Record<string, any>): Promise<number> {
  let contactRole: string | null = null;
  if (row.primary_contact_id) {
    const { data: c } = await sb.from('sales_contacts').select('role').eq('id', row.primary_contact_id).maybeSingle();
    contactRole = c?.role ?? null;
  }
  return calculateQualityScore({ ...row, primary_contact_role: contactRole });
}

export async function createOpportunity(input: Record<string, any>) {
  const ctx = await requireRepresentativeAction();
  const v = validateOpportunityInput(input);
  if (!v.valid) return { success: false as const, error: 'Preencha os campos obrigatórios', fieldErrors: v.errors };

  const sb = createSupabaseAdmin();

  // Conta e contato precisam ser do próprio RC (anti-IDOR).
  const { data: account, error: erroConta } = await sb.from('sales_accounts').select('id, representante_id, cnpj, codigo_inep').eq('id', input.account_id).maybeSingle();
  if (erroConta) return { success: false as const, error: erroConta.message };
  if (!account) return { success: false as const, error: 'Conta não encontrada' };
  assertRepresentativeOwnership(ctx, account.representante_id);
  const { data: contact, error: erroContato } = await sb.from('sales_contacts').select('id, representante_id, account_id, role').eq('id', input.primary_contact_id).maybeSingle();
  if (erroContato) return { success: false as const, error: erroContato.message };
  if (!contact || contact.account_id !== input.account_id) return { success: false as const, error: 'Contato inválido para esta conta' };
  assertRepresentativeOwnership(ctx, contact.representante_id);
  const faltando = camposDoRegistroNaConta(account, contact);
  if (faltando) return { success: false as const, error: faltando.error, fieldErrors: faltando.fieldErrors };

  // Cliente livre é aceito na hora; reserva, outro RC ou conferência que falhou vão para a fila (7.1).
  const agora = new Date();
  const quem = { representanteId: ctx.rep.id, cnpj: account.cnpj, codigoInep: account.codigo_inep };
  const decisao = await decidirRegistro(sb, quem, agora);

  const row = {
    representante_id: ctx.rep.id,
    account_id: input.account_id,
    primary_contact_id: input.primary_contact_id,
    opportunity_name: String(input.opportunity_name).trim(),
    origin: input.origin || null,
    product_interest: input.product_interest || null,
    identified_need: input.identified_need?.trim() || null,
    stage: input.stage as PipelineStage,
    estimated_value: numOrNull(input.estimated_value),
    estimated_close_date: input.estimated_close_date || null,
    next_action: input.next_action?.trim() || null,
    next_action_date: input.next_action_date || null,
    interaction_evidence: input.interaction_evidence?.trim() || null,
    ...decisao.campos,
    probability: numOrNull(input.probability),
    competitors: input.competitors?.trim() || null,
    objections: input.objections?.trim() || null,
    status: 'open' as const,
  };
  const quality_score = await scoreFor(sb, row);

  const { data, error } = await sb.from('sales_opportunities').insert({ ...row, quality_score }).select('id').single();
  if (error) return { success: false as const, error: error.message };

  const voltouParaFila = decisao.aceito ? await reconferirRegistroAceito(sb, data.id, quem, agora) : null;
  const aceito = decisao.aceito && !voltouParaFila;
  const mensagem = voltouParaFila ?? decisao.mensagem;
  // 7.6: quem registra depois vê só que o cliente já foi prospectado, a data e o estágio.
  const jaProspectado = aceito && decisao.jaProspectado
    ? `Este cliente já foi prospectado por outro representante (última movimentação em ${dataCurtaBRT(decisao.jaProspectado.em)}, estágio ${STAGE_LABELS[decisao.jaProspectado.estagio as PipelineStage] ?? decisao.jaProspectado.estagio}). A proteção dele acabou e o registro agora é seu.`
    : null;

  await registrarNota(sb, {
    representante_id: ctx.rep.id, opportunity_id: data.id, account_id: input.account_id,
    note: aceito ? `Oportunidade registrada. ${mensagem}` : `Oportunidade registrada e enviada para a validação da vertho.ai. ${mensagem}`,
    created_by_email: ctx.email,
  });

  return { success: true as const, id: data.id, aceito, mensagem, jaProspectado };
}


/**
 * Nota do histórico da oportunidade. É rastro, não a decisão: a falha não
 * desfaz o que já foi gravado, mas fica no log em vez de sumir.
 */
async function registrarNota(sb: ReturnType<typeof createSupabaseAdmin>, nota: Record<string, unknown>): Promise<void> {
  const { error } = await sb.from('sales_activity_notes').insert(nota);
  if (error) console.error('[sales] nota da oportunidade não gravada:', error.message);
}

/**
 * Campos do registro que moram na conta e no contato (cláusula 7.2 e Anexo III:
 * CNPJ do cliente e cargo do contato). `null` = completo.
 */
function camposDoRegistroNaConta(
  account: { cnpj?: string | null },
  contact: { role?: string | null },
): { error: string; fieldErrors: Record<string, string> } | null {
  const fieldErrors: Record<string, string> = {};
  if (!normalizarCnpj(account.cnpj)) fieldErrors.account_id = 'Informe o CNPJ da conta: o contrato exige o CNPJ no registro, e é por ele que o portal confere se o cliente está livre.';
  if (!contact.role?.trim()) fieldErrors.primary_contact_id = 'Cadastre o cargo do contato principal: o contrato exige o cargo no registro.';
  if (Object.keys(fieldErrors).length === 0) return null;
  return { error: 'O registro precisa do CNPJ da conta e do cargo do contato (cláusula 7.2 do contrato).', fieldErrors };
}

// ── Validação do registro pela vertho.ai (cláusulas 7.1, 7.3 e 7.5) ─────────

/**
 * Valida o registro que foi para a fila: a oportunidade passa a ser atribuída ao
 * RC e a proteção começa agora, como uma movimentação (7.5). Só registro
 * aguardando e oportunidade aberta.
 */
export async function validarRegistroOportunidade(opportunityId: string, observacao?: string) {
  const admin = await requireCommercialAdminAction();
  const sb = createSupabaseAdmin();
  const { data: opp, error: erroLeitura } = await sb.from('sales_opportunities')
    .select('id, representante_id, account_id, status, attribution_status').eq('id', opportunityId).maybeSingle();
  if (erroLeitura) return { success: false as const, error: erroLeitura.message };
  if (!opp) return { success: false as const, error: 'Oportunidade não encontrada' };
  if (opp.attribution_status !== 'aguardando') return { success: false as const, error: 'Este registro já foi decidido' };
  if (opp.status !== 'open') return { success: false as const, error: 'A oportunidade não está mais aberta' };

  const agora = new Date();
  const protection = protecaoAPartirDe(agora);
  const nota = observacao?.trim() || null;
  const { data: mudou, error } = await sb.from('sales_opportunities').update({
    attribution_status: 'validada',
    attribution_decided_at: agora.toISOString(),
    attribution_decided_by: admin.email,
    attribution_note: nota,
    protection_start_date: protection.start,
    protection_end_date: protection.end,
    protection_status: 'active',
    last_movement_at: agora.toISOString(),
    aviso_60_em: null,
    updated_at: agora.toISOString(),
  }).eq('id', opportunityId).eq('attribution_status', 'aguardando').select('id');
  if (error) return { success: false as const, error: error.message };
  if (!mudou || mudou.length === 0) return { success: false as const, error: 'Este registro já foi decidido' };

  await registrarNota(sb, {
    representante_id: opp.representante_id, opportunity_id: opportunityId, account_id: opp.account_id,
    note: `Registro validado pela vertho.ai: proteção comercial até ${dataCurtaBRT(protection.end)}, renovada a cada movimentação.${nota ? ` ${nota}` : ''}`,
    created_by_email: admin.email,
  });
  return { success: true as const, protecaoAte: protection.end };
}

/**
 * Recusa o registro da fila (7.3: cliente já ativo ou em negociação com a
 * vertho.ai, lead próprio, indicação de terceiro; 7.4: outro RC registrou
 * antes) ou REVOGA o aceite automático nos 10 dias da 7.1. A oportunidade sai
 * do funil como "sem avanço" e não gera comissão. O RC lê o motivo.
 */
export async function recusarRegistroOportunidade(opportunityId: string, motivo: string) {
  const admin = await requireCommercialAdminAction();
  const texto = motivo?.trim();
  if (!texto) return { success: false as const, error: 'Informe o motivo da recusa: o representante vai ler' };
  const sb = createSupabaseAdmin();
  const { data: opp, error: erroLeitura } = await sb.from('sales_opportunities')
    .select('id, representante_id, account_id, status, attribution_status, attribution_decided_by, attribution_decided_at').eq('id', opportunityId).maybeSingle();
  if (erroLeitura) return { success: false as const, error: erroLeitura.message };
  if (!opp) return { success: false as const, error: 'Oportunidade não encontrada' };
  const revogacao = revogavel(opp);
  if (opp.attribution_status !== 'aguardando' && !revogacao) {
    return { success: false as const, error: opp.attribution_decided_by === DECISOR_AUTOMATICO
      ? `O aceite automático só pode ser revogado em até ${JANELA_REVOGACAO_DIAS} dias (cláusula 7.1).`
      : 'Este registro já foi decidido' };
  }

  const agora = new Date().toISOString();
  let q = sb.from('sales_opportunities').update({
    attribution_status: 'recusada',
    attribution_decided_at: agora,
    attribution_decided_by: admin.email,
    attribution_note: texto,
    status: 'expired',
    stage: 'sem_avanco_expirado',
    updated_at: agora,
  }).eq('id', opportunityId);
  // Update condicional: só a transição que o admin viu vale (outro admin, ou a validação, pode ter chegado antes).
  q = revogacao
    ? q.eq('attribution_status', 'validada').eq('attribution_decided_by', DECISOR_AUTOMATICO)
    : q.eq('attribution_status', 'aguardando');
  const { data: mudou, error } = await q.select('id');
  if (error) return { success: false as const, error: error.message };
  if (!mudou || mudou.length === 0) return { success: false as const, error: 'Este registro já foi decidido' };

  // Proposta aberta de registro recusado ou revogado não pode mais ser enviada nem aceita.
  const { error: erroPropostas } = await sb.from('sales_proposals').update({
    status: 'lost', rejection_reason: `Registro ${revogacao ? 'revogado' : 'recusado'} pela vertho.ai: ${texto}`, updated_at: agora,
  }).eq('opportunity_id', opportunityId).in('status', ['draft', 'submitted_for_approval', 'changes_requested', 'approved', 'sent_to_client']);
  if (erroPropostas) console.error('[sales] propostas do registro recusado não foram encerradas:', erroPropostas.message);

  await registrarNota(sb, {
    representante_id: opp.representante_id, opportunity_id: opportunityId, account_id: opp.account_id,
    note: revogacao ? `Aceite automático revogado pela vertho.ai (cláusula 7.1): ${texto}` : `Registro recusado pela vertho.ai: ${texto}`,
    created_by_email: admin.email,
  });
  return { success: true as const };
}

export async function updateOpportunity(opportunityId: string, input: Record<string, any>) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: existing } = await sb.from('sales_opportunities').select('*').eq('id', opportunityId).maybeSingle();
  if (!existing) return { success: false as const, error: 'Oportunidade não encontrada' };
  assertRepresentativeOwnership(ctx, existing.representante_id);
  if (existing.status !== 'open') return { success: false as const, error: 'Oportunidade fechada não pode ser editada' };

  // Campos que o RC pode editar (proteção/status NÃO entram aqui).
  const patch: Record<string, any> = {};
  const editable = [
    'opportunity_name', 'origin', 'product_interest', 'identified_need', 'estimated_value',
    'estimated_close_date', 'next_action', 'next_action_date', 'interaction_evidence',
    'probability', 'competitors', 'objections', 'primary_contact_id',
  ];
  for (const k of editable) if (k in input) patch[k] = typeof input[k] === 'string' ? (input[k].trim() || null) : input[k];
  if ('estimated_value' in patch) {
    patch.estimated_value = numOrNull(patch.estimated_value);
    if (patch.estimated_value != null && patch.estimated_value < 0) return { success: false as const, error: 'Valor estimado não pode ser negativo' };
  }
  if ('probability' in patch) patch.probability = numOrNull(patch.probability);
  if (patch.primary_contact_id) {
    const { data: contact } = await sb.from('sales_contacts').select('representante_id, account_id').eq('id', patch.primary_contact_id).maybeSingle();
    if (!contact || contact.account_id !== existing.account_id) return { success: false as const, error: 'Contato inválido para esta conta' };
    assertRepresentativeOwnership(ctx, contact.representante_id);
  }

  const merged = { ...existing, ...patch };
  patch.quality_score = await scoreFor(sb, merged);
  patch.protection_status = computeProtectionStatus(existing.protection_end_date, existing.protection_status);
  patch.updated_at = new Date().toISOString();

  const { error } = await sb.from('sales_opportunities').update(patch).eq('id', opportunityId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

/** Move de estágio; estágios terminais fecham a oportunidade. */
export async function moveOpportunityStage(opportunityId: string, stage: string, lossReason?: string) {
  const ctx = await requireRepresentativeAction();
  if (!PIPELINE_STAGES.includes(stage as PipelineStage)) return { success: false as const, error: 'Estágio inválido' };
  const sb = createSupabaseAdmin();
  const { data: existing } = await sb.from('sales_opportunities').select('id, representante_id, status, stage, account_id').eq('id', opportunityId).maybeSingle();
  if (!existing) return { success: false as const, error: 'Oportunidade não encontrada' };
  assertRepresentativeOwnership(ctx, existing.representante_id);
  if (existing.status !== 'open') return { success: false as const, error: 'Oportunidade fechada não pode mudar de estágio' };

  const patch: Record<string, any> = { stage, updated_at: new Date().toISOString() };
  if (stage === 'fechado_ganho') patch.status = 'won';
  if (stage === 'fechado_perdido') {
    if (!lossReason?.trim()) return { success: false as const, error: 'Informe o motivo da perda' };
    patch.status = 'lost';
    patch.loss_reason = lossReason.trim();
  }
  if (stage === 'sem_avanco_expirado') patch.status = 'expired';

  const { error } = await sb.from('sales_opportunities').update(patch).eq('id', opportunityId);
  if (error) return { success: false as const, error: error.message };

  // Mudança de estágio é movimentação (7.5): renova a proteção da que segue aberta.
  await registrarMovimentacao(sb, opportunityId);

  // Conta vira cliente ativo no ganho.
  if (stage === 'fechado_ganho' && existing.account_id) {
    await sb.from('sales_accounts').update({ status: 'active_client', contract_start_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('id', existing.account_id);
  }
  await sb.from('sales_activity_notes').insert({
    representante_id: ctx.rep.id, opportunity_id: opportunityId, account_id: existing.account_id,
    note: `Estágio: ${existing.stage} → ${stage}${lossReason ? ` (${lossReason.trim()})` : ''}`,
    created_by_email: ctx.email,
  });
  return { success: true as const };
}

export async function addActivityNote(opportunityId: string, note: string) {
  const ctx = await requireRepresentativeAction();
  const text = String(note || '').trim();
  if (!text) return { success: false as const, error: 'Nota vazia' };
  const sb = createSupabaseAdmin();
  const { data: opp } = await sb.from('sales_opportunities').select('representante_id, account_id').eq('id', opportunityId).maybeSingle();
  if (!opp) return { success: false as const, error: 'Oportunidade não encontrada' };
  assertRepresentativeOwnership(ctx, opp.representante_id);
  const { error } = await sb.from('sales_activity_notes').insert({
    representante_id: ctx.rep.id, opportunity_id: opportunityId, account_id: opp.account_id,
    note: text, created_by_email: ctx.email,
  });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

/** Evidência mínima de um contato: o bastante para alguém de fora entender o que aconteceu. */
const EVIDENCIA_MINIMA = 15;

/**
 * Contato com o cliente, com canal e evidência (contrato, 7.5): é movimentação e
 * renova a proteção por mais 90 dias. A nota simples não renova.
 */
export async function registrarContato(opportunityId: string, input: { canal: string; evidencia: string }) {
  const ctx = await requireRepresentativeAction();
  const canal = String(input?.canal || '') as CanalDeContato;
  if (!CANAIS_DE_CONTATO.includes(canal)) return { success: false as const, error: 'Escolha o canal do contato' };
  const evidencia = String(input?.evidencia || '').trim();
  if (evidencia.length < EVIDENCIA_MINIMA) {
    return { success: false as const, error: 'Descreva o contato: com quem falou, o que foi tratado e o próximo passo.' };
  }
  const sb = createSupabaseAdmin();
  const { data: opp, error: erroLeitura } = await sb.from('sales_opportunities')
    .select('representante_id, account_id, status').eq('id', opportunityId).maybeSingle();
  if (erroLeitura) return { success: false as const, error: erroLeitura.message };
  if (!opp) return { success: false as const, error: 'Oportunidade não encontrada' };
  assertRepresentativeOwnership(ctx, opp.representante_id);
  if (opp.status !== 'open') return { success: false as const, error: 'Oportunidade fechada não recebe contato' };

  const { error } = await sb.from('sales_activity_notes').insert({
    representante_id: ctx.rep.id, opportunity_id: opportunityId, account_id: opp.account_id,
    kind: 'contato', canal, note: `${CANAL_LABELS[canal]}: ${evidencia}`, created_by_email: ctx.email,
  });
  if (error) return { success: false as const, error: error.message };

  const mov = await registrarMovimentacao(sb, opportunityId);
  if (mov.renovada) return { success: true as const, mensagem: `Contato registrado. Proteção comercial até ${dataCurtaBRT(mov.protecaoAte)}.` };
  if (mov.motivo === 'cliente_com_outro') {
    return { success: true as const, mensagem: 'Contato registrado. A proteção já tinha acabado e o cliente está com outro representante (cláusula 7.6).' };
  }
  if (mov.motivo === 'falha') return { success: true as const, mensagem: 'Contato registrado, mas a proteção não foi renovada agora. Tente de novo ou avise a vertho.ai.' };
  return { success: true as const, mensagem: 'Contato registrado.' };
}

/** Resumo do pipeline do RC (dashboard): KPIs + grupos por estágio. */
export async function getPipelineSummary() {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_opportunities').select(OPP_SELECT).eq('representante_id', ctx.rep.id);
  if (error) return { success: false as const, error: error.message };
  const opps = (data || []).map(withDerivedProtection);
  return {
    success: true as const,
    kpis: {
      pipelineTotal: pipelineTotal(opps),
      pipelineQualificado: pipelineQualificado(opps),
      pipelinePonderado: pipelinePonderado(opps),
    },
    stages: groupByStage(opps),
  };
}

/**
 * Alertas de atenção imediata do RC: sem próxima ação e, desde o contrato v6,
 * 60 dias ou mais sem movimentação (o aviso da 7.5; a proteção cai aos 90).
 */
export async function getOpportunityAlerts() {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_opportunities').select(OPP_SELECT).eq('representante_id', ctx.rep.id).eq('status', 'open');
  if (error) return { success: false as const, error: error.message };
  const opps = (data || []).map(withDerivedProtection);
  const hoje = new Date();
  return {
    success: true as const,
    semProximaAcao: oportunidadesSemProximaAcao(opps).map((o) => ({ id: o.id, nome: o.opportunity_name, conta: o.account?.trade_name || o.account?.legal_name || '' })),
    semMovimentacao: opps.filter((o) => precisaDeMovimentacao(o, hoje)).map((o) => {
      const vencida = !!o.protection_end_date && o.protection_end_date < dataBRT(hoje);
      const dias = diasSemMovimento(o.last_movement_at || o.protection_start_date, hoje);
      return {
        id: o.id, nome: o.opportunity_name, conta: o.account?.trade_name || o.account?.legal_name || '',
        alerta: vencida
          ? 'Proteção encerrada: o cliente ficou livre'
          : `${dias} dias sem movimentação · ${protectionAlertLabel(o.protection_end_date) ?? `proteção até ${dataCurtaBRT(o.protection_end_date!)}`}`,
        fim: o.protection_end_date,
      };
    }),
  };
}
