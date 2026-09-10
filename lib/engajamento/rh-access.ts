import 'server-only';
import { requireRoleAction } from '@/lib/auth/action-context';
import { tenantDb } from '@/lib/tenant-db';

export async function requireRhEngagement() {
  const ctx = await requireRoleAction(['rh', 'admin']);
  if (!ctx.empresaId) throw new Error('FORBIDDEN: usuário sem empresa');
  return { ...ctx, empresaId: ctx.empresaId };
}

export async function getRhEngagementCompany() {
  const ctx = await requireRhEngagement();
  const { data, error } = await tenantDb(ctx.empresaId).raw.from('empresas')
    .select('nome').eq('id', ctx.empresaId).maybeSingle();
  if (error || !data) throw new Error('Não foi possível identificar a empresa.');
  return { empresaId: ctx.empresaId, empresaNome: data.nome };
}
