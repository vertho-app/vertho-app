'use server';

// Portal do Representante — representantes (perfil do RC + gestão pelo admin).
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  getRepresentativeContext as getRepCtx,
  requireCommercialAdminAction,
} from '@/lib/sales/permissions';
import type { SalesRepresentative } from '@/lib/sales/types';

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
}) {
  const admin = await requireCommercialAdminAction();
  const email = String(input.email || '').trim().toLowerCase();
  const name = String(input.name || '').trim();
  if (!email || !email.includes('@')) return { success: false as const, error: 'E-mail inválido' };
  if (!name) return { success: false as const, error: 'Nome é obrigatório' };

  const sb = createSupabaseAdmin();
  const { data: existing } = await sb.from('sales_representatives').select('id').eq('email', email).maybeSingle();
  if (existing) return { success: false as const, error: 'Já existe representante com este e-mail' };

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
    status: 'active',
  }).select('*').single();
  if (error) return { success: false as const, error: error.message };

  console.log(`[sales] RC criado por ${admin.email}: ${email}`);
  return { success: true as const, data: data as SalesRepresentative };
}

export async function updateRepresentativeStatus(repId: string, status: 'active' | 'inactive' | 'suspended') {
  const admin = await requireCommercialAdminAction();
  if (!['active', 'inactive', 'suspended'].includes(status)) return { success: false as const, error: 'Status inválido' };
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('sales_representatives')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', repId);
  if (error) return { success: false as const, error: error.message };
  console.log(`[sales] RC ${repId} → ${status} por ${admin.email}`);
  return { success: true as const };
}
