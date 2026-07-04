'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { getUserContext } from '@/lib/authz';
import { getEffectivePermissionKeys, getSystemRole, type PermissionKey } from '@/lib/permissions';

export type EmpresaLite = { id: string; nome: string; totalColab: number };

export type AdminShellPermissoes = {
  role: 'platform_admin' | 'socio' | null;
  permissions: PermissionKey[];
};

/**
 * Papel + permissões efetivas do admin logado, para a UI filtrar nav e
 * desabilitar botões (Reorganização do admin, Fase 5). É só UX: o enforcement
 * real continua 100% nas server actions via requireAdminAction(permission).
 */
export async function loadAdminShellPermissoes(): Promise<AdminShellPermissoes> {
  try {
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { role: null, permissions: [] };
    const ctx = await getUserContext(email);
    if (!ctx?.isPlatformAdmin) return { role: null, permissions: [] };
    const role = getSystemRole(ctx);
    const keys = await getEffectivePermissionKeys({ ...ctx, email });
    return {
      role: role === 'socio' ? 'socio' : 'platform_admin',
      permissions: [...keys],
    };
  } catch {
    return { role: null, permissions: [] };
  }
}

/**
 * Lista enxuta de empresas para o filtro do shell admin (id, nome, contagem de
 * colaboradores). Bem mais leve que loadAdminDashboard — roda em toda página
 * admin, então evita os health checks e contagens globais daquele.
 */
export async function loadAdminShellEmpresas(): Promise<EmpresaLite[]> {
  const sb = await requireAdminSupabase();

  const empresasComCount = await sb
    .from('empresas')
    .select('id, nome, colaboradores(count)')
    .order('nome');

  if (!empresasComCount.error && empresasComCount.data) {
    return empresasComCount.data.map((e: any) => ({
      id: e.id,
      nome: e.nome,
      totalColab: Number(e.colaboradores?.[0]?.count || 0),
    }));
  }

  const [empresasRes, colabsRes] = await Promise.all([
    sb.from('empresas').select('id, nome').order('nome'),
    sb.from('colaboradores').select('empresa_id'),
  ]);

  const empresas = empresasRes.data || [];
  const colabs = colabsRes.data || [];

  const porEmpresa: Record<string, number> = {};
  for (const c of colabs) porEmpresa[c.empresa_id] = (porEmpresa[c.empresa_id] || 0) + 1;

  return empresas.map((e) => ({ id: e.id, nome: e.nome, totalColab: porEmpresa[e.id] || 0 }));
}
