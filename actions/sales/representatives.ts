'use server';

// Portal do Representante — representantes (perfil do RC + gestão pelo admin).
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  getRepresentativeContext as getRepCtx,
  requireCommercialAdminAction,
} from '@/lib/sales/permissions';
import { COMPENSATION_MODELS, type CompensationModel } from '@/lib/sales/constants';
import { normalizarEmail } from '@/lib/sales/equipe';
import { logAdminAction } from '@/lib/audit';
import type { SalesRepresentative } from '@/lib/sales/types';

const modeloValido = (m: unknown): m is CompensationModel =>
  typeof m === 'string' && (COMPENSATION_MODELS as readonly string[]).includes(m);

/** Perfil do RC logado (null se o usuário não é representante). */
export async function getRepresentativeContext(): Promise<{ success: boolean; rep: SalesRepresentative | null }> {
  const ctx = await getRepCtx();
  return { success: true, rep: ctx?.rep ?? null };
}

/** Lista de RCs para o admin (com contagens básicas do canal). */
export async function listRepresentativesForAdmin() {
  await requireCommercialAdminAction(false);
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('sales_representatives')
    .select('*')
    .order('name');
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: (data || []) as SalesRepresentative[] };
}

export async function createRepresentative(input: {
  email: string; name: string; company_name?: string | null; cnpj?: string | null;
  core_registration?: string | null; phone?: string | null; region?: string | null;
  compensation_model?: CompensationModel | null;
}) {
  const admin = await requireCommercialAdminAction();
  const email = String(input.email || '').trim().toLowerCase();
  const name = String(input.name || '').trim();
  if (!email || !email.includes('@')) return { success: false as const, error: 'E-mail inválido' };
  if (!name) return { success: false as const, error: 'Nome é obrigatório' };
  // O modelo decide as taxas de comissão (commissionRatesFor). Valor fora da
  // lista é recusado, e não trocado pelo padrão em silêncio.
  const compensationModel = input.compensation_model ?? 'sem_ajuda';
  if (!modeloValido(compensationModel)) return { success: false as const, error: 'Modelo de remuneração inválido' };

  const sb = createSupabaseAdmin();
  const { data: existing } = await sb.from('sales_representatives').select('id').eq('email', email).maybeSingle();
  if (existing) return { success: false as const, error: 'Já existe representante com este e-mail' };
  // Um e-mail opera um representante só: integrante de equipe não vira RC por cima.
  const { data: integrante, error: erroIntegrante } = await sb.from('sales_representative_users').select('id').eq('email', email).maybeSingle();
  if (erroIntegrante) return { success: false as const, error: erroIntegrante.message };
  if (integrante) return { success: false as const, error: 'Este e-mail já é de um integrante da equipe de outro representante' };

  // Se o e-mail já tem usuário auth, vincula o user_id (login imediato).
  let userId: string | null = null;
  try {
    const { data: users } = await (sb as any).auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = users?.users?.find((u: any) => u.email?.toLowerCase() === email)?.id ?? null;
  } catch { /* vínculo é opcional; login resolve por e-mail */ }

  const { data, error } = await sb.from('sales_representatives').insert({
    email, name, user_id: userId,
    company_name: input.company_name?.trim() || null,
    cnpj: input.cnpj?.trim() || null,
    core_registration: input.core_registration?.trim() || null,
    phone: input.phone?.trim() || null,
    region: input.region?.trim() || null,
    compensation_model: compensationModel,
    status: 'active',
  }).select('*').single();
  if (error) return { success: false as const, error: error.message };

  console.log(`[sales] RC criado por ${admin.email}: ${email}`);
  return { success: true as const, data: data as SalesRepresentative };
}

/**
 * Troca o modelo de remuneração do RC. Vale para as propostas e aceites
 * SEGUINTES: estimativas já gravadas e eventos de comissão já lançados não são
 * recalculados (o extrato e a aprovação leem a taxa da própria estimativa).
 */
export async function updateRepresentativeCompensationModel(repId: string, model: CompensationModel) {
  const admin = await requireCommercialAdminAction();
  if (!modeloValido(model)) return { success: false as const, error: 'Modelo de remuneração inválido' };
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('sales_representatives')
    .update({ compensation_model: model, updated_at: new Date().toISOString() })
    .eq('id', repId);
  if (error) return { success: false as const, error: error.message };
  console.log(`[sales] RC ${repId} → modelo ${model} por ${admin.email}`);
  return { success: true as const };
}

/**
 * Desativar = encerrar o contrato de representação: grava `contract_ended_at`,
 * o marco da cláusula 18.7 (depois dele só geram comissão as propostas aceitas
 * antes, ou enviadas antes e aceitas dentro da validade). Reativar apaga o
 * marco: é um contrato novo. Suspender não encerra nada.
 */
export async function updateRepresentativeStatus(repId: string, status: 'active' | 'inactive' | 'suspended') {
  const admin = await requireCommercialAdminAction();
  if (!['active', 'inactive', 'suspended'].includes(status)) return { success: false as const, error: 'Status inválido' };
  const sb = createSupabaseAdmin();
  const { data: atual, error: erroLeitura } = await sb.from('sales_representatives').select('status, contract_ended_at').eq('id', repId).maybeSingle();
  if (erroLeitura) return { success: false as const, error: erroLeitura.message };
  if (!atual) return { success: false as const, error: 'Representante não encontrado' };
  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: agora };
  if (status === 'inactive' && !atual.contract_ended_at) patch.contract_ended_at = agora;
  if (status === 'active') patch.contract_ended_at = null;
  const { error } = await sb.from('sales_representatives')
    .update(patch)
    .eq('id', repId);
  if (error) return { success: false as const, error: error.message };
  console.log(`[sales] RC ${repId} → ${status} por ${admin.email}`);
  return { success: true as const };
}

// ── Equipe do representante (contrato v6, 21.4; mig 298) ───────────────────

export type IntegranteRow = { id: string; name: string; email: string; status: 'active' | 'inactive'; created_at: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Integrantes da equipe de um RC (só admin). */
export async function listarEquipe(repId: string) {
  await requireCommercialAdminAction(false);
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_representative_users')
    .select('id, name, email, status, created_at').eq('representante_id', repId).order('name');
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: (data || []) as IntegranteRow[] };
}

/**
 * Dá login a um integrante da equipe do RC (21.4): ele opera o mesmo portal, e o
 * que faz sai assinado com o e-mail dele. A comissão continua do representante.
 * Um e-mail opera um representante só.
 */
export async function adicionarIntegrante(repId: string, input: { name: string; email: string }) {
  const admin = await requireCommercialAdminAction(true);
  const email = normalizarEmail(input?.email);
  const name = String(input?.name || '').trim();
  if (!name) return { success: false as const, error: 'Informe o nome' };
  if (!EMAIL_RE.test(email)) return { success: false as const, error: 'E-mail inválido' };
  const sb = createSupabaseAdmin();
  const [{ data: rep, error: erroRep }, { data: ehRc, error: erroRc }, { data: jaEsta, error: erroJa }] = await Promise.all([
    sb.from('sales_representatives').select('id, name').eq('id', repId).maybeSingle(),
    sb.from('sales_representatives').select('id').eq('email', email).maybeSingle(),
    sb.from('sales_representative_users').select('id, representante_id, status').eq('email', email).maybeSingle(),
  ]);
  const erro = erroRep || erroRc || erroJa;
  if (erro) return { success: false as const, error: erro.message };
  if (!rep) return { success: false as const, error: 'Representante não encontrado' };
  if (ehRc) return { success: false as const, error: 'Este e-mail já é de um representante' };
  if (jaEsta && jaEsta.representante_id !== repId) return { success: false as const, error: 'Este e-mail já é da equipe de outro representante' };

  const { error } = jaEsta
    ? await sb.from('sales_representative_users').update({ name, status: 'active' }).eq('id', jaEsta.id)
    : await sb.from('sales_representative_users').insert({ representante_id: repId, email, name, status: 'active', criado_por: admin.email });
  if (error) return { success: false as const, error: error.message };
  await logAdminAction({ adminEmail: admin.email, acao: 'sales_equipe.adicionar', alvo: `${rep.name} (${repId})`, detalhes: { email, name } });
  return { success: true as const };
}

/** Tira o acesso de um integrante (o histórico do que ele fez fica). */
export async function desativarIntegrante(integranteId: string) {
  const admin = await requireCommercialAdminAction(true);
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_representative_users').update({ status: 'inactive' })
    .eq('id', integranteId).select('email, representante_id');
  if (error) return { success: false as const, error: error.message };
  const linha = (data || [])[0] as { email: string; representante_id: string } | undefined;
  if (!linha) return { success: false as const, error: 'Integrante não encontrado' };
  await logAdminAction({ adminEmail: admin.email, acao: 'sales_equipe.desativar', alvo: linha.representante_id, detalhes: { email: linha.email } });
  return { success: true as const };
}
