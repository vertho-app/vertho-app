'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction } from '@/lib/auth/action-context';

export async function loadPlatformAdmins() {
  await requireAdminAction();

  const sb = createSupabaseAdmin();
  const { data } = await sb.from('platform_admins')
    .select('id, email, nome, created_at')
    .order('created_at');
  return data || [];
}

export async function adicionarAdmin(email, nome) {
  await requireAdminAction();
  if (!email?.trim()) return { success: false, error: 'Email obrigatorio' };

  const sb = createSupabaseAdmin();
  const clean = email.trim().toLowerCase();

  // Verificar se já existe
  const { data: existing } = await sb.from('platform_admins')
    .select('id').eq('email', clean).single();
  if (existing) return { success: false, error: 'Este email ja e admin' };

  const { error } = await sb.from('platform_admins')
    .insert({ email: clean, nome: nome?.trim() || null });
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${clean} adicionado como admin` };
}

export async function removerAdmin(id) {
  await requireAdminAction();
  if (!id) return { success: false, error: 'ID obrigatorio' };
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('platform_admins').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, message: 'Admin removido' };
}
