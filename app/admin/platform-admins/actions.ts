'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';

export async function loadPlatformAdmins() {
  const sb = await requireAdminSupabase();
  const { data } = await sb.from('platform_admins')
    .select('id, email, nome, created_at')
    .order('created_at');
  return data || [];
}

export async function adicionarAdmin(email: any, nome: any) {
  const sb = await requireAdminSupabase();
  if (!email?.trim()) return { success: false, error: 'Email obrigatorio' };

  const clean = email.trim().toLowerCase();

  const { data: existing } = await sb.from('platform_admins')
    .select('id').eq('email', clean).single();
  if (existing) return { success: false, error: 'Este email ja e admin' };

  const { error } = await sb.from('platform_admins')
    .insert({ email: clean, nome: nome?.trim() || null });
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${clean} adicionado como admin` };
}

export async function removerAdmin(id: any) {
  const sb = await requireAdminSupabase();
  if (!id) return { success: false, error: 'ID obrigatorio' };
  const { error } = await sb.from('platform_admins').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, message: 'Admin removido' };
}
