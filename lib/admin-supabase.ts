import { requirePermissionAction } from '@/lib/auth/action-context';
import { createSupabaseAdmin } from '@/lib/supabase';
import type { PermissionKey } from '@/lib/permissions';

/**
 * Helper para actions administrativas: autoriza o caller (permissão granular)
 * antes de devolver um client com service_role.
 *
 * Default = 'admin.access' (qualquer admin, master ou sócio — usado em LEITURAS).
 * Para AÇÕES DE ESCRITA/DESTRUTIVAS, passe a permissão específica do domínio
 * (ex.: 'content.manage', 'trash.manage', 'users.manage') — assim o Admin Sócio,
 * que não tem essas permissões, é bloqueado, enquanto o master segue liberado.
 */
export async function requireAdminSupabase(permission: PermissionKey = 'admin.access') {
  await requirePermissionAction(permission);
  return createSupabaseAdmin();
}
