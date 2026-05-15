import { requireAdminAction } from '@/lib/auth/action-context';
import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Helper para actions administrativas: autentica/autorizada o caller antes de
 * devolver um client com service_role.
 */
export async function requireAdminSupabase() {
  await requireAdminAction();
  return createSupabaseAdmin();
}
