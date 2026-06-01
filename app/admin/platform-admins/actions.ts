'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requirePermissionAction } from '@/lib/auth/action-context';

export async function loadPlatformAdmins() {
  await requirePermissionAction('platform_admins.manage');
  const sb = await requireAdminSupabase();
  const { data } = await sb.from('platform_admins')
    .select('id, email, nome, role, created_at')
    .order('created_at');
  return data || [];
}

function normalizeRole(role: any): 'master' | 'socio' {
  return role === 'socio' ? 'socio' : 'master';
}

export async function adicionarAdmin(email: any, nome: any, role: any = 'master') {
  await requirePermissionAction('platform_admins.manage');
  const sb = await requireAdminSupabase();
  if (!email?.trim()) return { success: false, error: 'Email obrigatorio' };

  const clean = email.trim().toLowerCase();

  const { data: existing } = await sb.from('platform_admins')
    .select('id').eq('email', clean).single();
  if (existing) return { success: false, error: 'Este email ja e admin' };

  const { error } = await sb.from('platform_admins')
    .insert({ email: clean, nome: nome?.trim() || null, role: normalizeRole(role) });
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${clean} adicionado como ${normalizeRole(role) === 'socio' ? 'Admin Sócio' : 'Admin Master'}` };
}

export async function definirRoleAdmin(id: any, role: any) {
  await requirePermissionAction('platform_admins.manage');
  const sb = await requireAdminSupabase();
  if (!id) return { success: false, error: 'ID obrigatório' };
  const novo = normalizeRole(role);
  const { error } = await sb.from('platform_admins').update({ role: novo }).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `Papel atualizado para ${novo === 'socio' ? 'Admin Sócio' : 'Admin Master'}` };
}

export async function removerAdmin(id: any) {
  await requirePermissionAction('platform_admins.manage');
  const sb = await requireAdminSupabase();
  if (!id) return { success: false, error: 'ID obrigatorio' };
  const { error } = await sb.from('platform_admins').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, message: 'Admin removido' };
}
