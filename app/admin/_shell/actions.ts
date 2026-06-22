'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';

export type EmpresaLite = { id: string; nome: string; totalColab: number };

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
