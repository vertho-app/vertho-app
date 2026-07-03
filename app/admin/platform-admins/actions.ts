'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requirePermissionAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';

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
  const ctx = await requirePermissionAction('platform_admins.manage');
  const sb = await requireAdminSupabase();
  if (!email?.trim()) return { success: false, error: 'Email obrigatorio' };

  const clean = email.trim().toLowerCase();

  const { data: existing } = await sb.from('platform_admins')
    .select('id').eq('email', clean).single();
  if (existing) return { success: false, error: 'Este email ja e admin' };

  const novo = normalizeRole(role);
  const { error } = await sb.from('platform_admins')
    .insert({ email: clean, nome: nome?.trim() || null, role: novo });
  if (error) return { success: false, error: error.message };
  // Auditoria: operação crítica de privilégio (criação de admin de plataforma).
  await logAdminAction({ adminEmail: ctx.email, acao: 'platform_admin.adicionar', alvo: clean, detalhes: { role: novo } });
  return { success: true, message: `${clean} adicionado como ${novo === 'socio' ? 'Admin Sócio' : 'Admin Master'}` };
}

export async function definirRoleAdmin(id: any, role: any) {
  const ctx = await requirePermissionAction('platform_admins.manage');
  const sb = await requireAdminSupabase();
  if (!id) return { success: false, error: 'ID obrigatório' };
  const { data: alvoAdmin } = await sb.from('platform_admins').select('email, role').eq('id', id).maybeSingle();
  // Self-protection: um master não pode rebaixar a si mesmo (se-lockout). Como
  // só é possível agir sobre OUTROS, o último master sempre sobrevive.
  if ((alvoAdmin as any)?.email && (alvoAdmin as any).email.toLowerCase() === ctx.email?.toLowerCase()) {
    return { success: false, error: 'Você não pode alterar o próprio papel de admin.' };
  }
  const novo = normalizeRole(role);
  const { error } = await sb.from('platform_admins').update({ role: novo }).eq('id', id);
  if (error) return { success: false, error: error.message };
  await logAdminAction({ adminEmail: ctx.email, acao: 'platform_admin.alterar_role', alvo: (alvoAdmin as any)?.email || id, detalhes: { de: (alvoAdmin as any)?.role, para: novo } });
  return { success: true, message: `Papel atualizado para ${novo === 'socio' ? 'Admin Sócio' : 'Admin Master'}` };
}

export async function removerAdmin(id: any) {
  const ctx = await requirePermissionAction('platform_admins.manage');
  const sb = await requireAdminSupabase();
  if (!id) return { success: false, error: 'ID obrigatorio' };
  const { data: alvoAdmin } = await sb.from('platform_admins').select('email, role').eq('id', id).maybeSingle();
  // Self-protection: um master não pode remover a si mesmo (se-lockout).
  if ((alvoAdmin as any)?.email && (alvoAdmin as any).email.toLowerCase() === ctx.email?.toLowerCase()) {
    return { success: false, error: 'Você não pode remover a si mesmo.' };
  }
  const { error } = await sb.from('platform_admins').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  await logAdminAction({ adminEmail: ctx.email, acao: 'platform_admin.remover', alvo: (alvoAdmin as any)?.email || id, detalhes: { role: (alvoAdmin as any)?.role } });
  return { success: true, message: 'Admin removido' };
}
