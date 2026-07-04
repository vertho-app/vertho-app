'use server';

// Portal do Representante — contatos das contas.
//
// Regras: contato pertence ao RC via representante_id (denormalizado da conta);
// apenas um contato principal por conta (is_primary exclusivo).
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  requireRepresentativeAction,
  requireRepresentativeOrAdminAction,
  assertRepresentativeOwnership,
} from '@/lib/sales/permissions';
import type { SalesContact } from '@/lib/sales/types';

export async function listContactsByAccount(accountId: string) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  const { data: account } = await sb.from('sales_accounts').select('id, representante_id').eq('id', accountId).maybeSingle();
  if (!account) return { success: false as const, error: 'Conta não encontrada' };
  if (ctx.kind === 'representative' && account.representante_id !== ctx.rep.id) {
    return { success: false as const, error: 'FORBIDDEN: conta de outro representante' };
  }
  const { data, error } = await sb.from('sales_contacts').select('*')
    .eq('account_id', accountId)
    .order('is_primary', { ascending: false })
    .order('name');
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: (data || []) as SalesContact[] };
}

export async function createSalesContact(input: {
  account_id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
}) {
  const ctx = await requireRepresentativeAction();
  const name = String(input.name || '').trim();
  if (!name) return { success: false as const, error: 'Nome do contato é obrigatório' };
  if (!input.account_id) return { success: false as const, error: 'Selecione a conta' };

  const sb = createSupabaseAdmin();
  // Conta precisa ser do próprio RC (anti-IDOR).
  const { data: account } = await sb.from('sales_accounts').select('id, representante_id').eq('id', input.account_id).maybeSingle();
  if (!account) return { success: false as const, error: 'Conta não encontrada' };
  assertRepresentativeOwnership(ctx, account.representante_id);

  // Contato principal é exclusivo: zera os demais antes.
  if (input.is_primary === true) {
    await sb.from('sales_contacts').update({ is_primary: false, updated_at: new Date().toISOString() }).eq('account_id', input.account_id);
  }

  const { data, error } = await sb.from('sales_contacts').insert({
    account_id: input.account_id,
    representante_id: ctx.rep.id,
    name,
    role: input.role?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    is_primary: input.is_primary === true,
  }).select('*').single();
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: data as SalesContact };
}

export async function updateSalesContact(contactId: string, input: {
  name?: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
}) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: existing } = await sb.from('sales_contacts').select('id, representante_id, account_id').eq('id', contactId).maybeSingle();
  if (!existing) return { success: false as const, error: 'Contato não encontrado' };
  assertRepresentativeOwnership(ctx, existing.representante_id);

  const patch: Record<string, any> = {};
  if ('name' in input) {
    const name = String(input.name || '').trim();
    if (!name) return { success: false as const, error: 'Nome do contato é obrigatório' };
    patch.name = name;
  }
  for (const k of ['role', 'email', 'phone'] as const) {
    if (k in input) patch[k] = typeof input[k] === 'string' ? (input[k]!.trim() || null) : input[k] ?? null;
  }
  if ('is_primary' in input) {
    patch.is_primary = input.is_primary === true;
    // Contato principal é exclusivo: zera os demais da mesma conta antes.
    if (patch.is_primary) {
      await sb.from('sales_contacts').update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('account_id', existing.account_id).neq('id', contactId);
    }
  }

  patch.updated_at = new Date().toISOString();
  const { error } = await sb.from('sales_contacts').update(patch).eq('id', contactId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}
