'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadAdminDashboard() {
  const sb = createSupabaseAdmin();

  const [empresasRes, colabsRes, respostasRes, cenariosRes, trilhasRes, capacitacaoRes] = await Promise.all([
    sb.from('empresas').select('id, nome, segmento, slug, created_at').order('nome'),
    sb.from('colaboradores').select('id, empresa_id', { count: 'exact', head: false }),
    sb.from('respostas').select('id', { count: 'exact', head: true }),
    sb.from('banco_cenarios').select('id', { count: 'exact', head: true }),
    (sb.from('trilhas').select('id', { count: 'exact', head: true }) as any).then((r: any) => r).catch(() => ({ count: 0 })),
    (sb.from('capacitacao').select('id', { count: 'exact', head: true }) as any).then((r: any) => r).catch(() => ({ count: 0 })),
  ]);

  const empresas = empresasRes.data || [];
  const colabs = colabsRes.data || [];

  // Enriquecer empresas com contagem de colaboradores
  const colabsPorEmpresa = {};
  colabs.forEach(c => {
    colabsPorEmpresa[c.empresa_id] = (colabsPorEmpresa[c.empresa_id] || 0) + 1;
  });

  const enriched = empresas.map(emp => ({
    ...emp,
    totalColab: colabsPorEmpresa[emp.id] || 0,
  }));

  // System health check
  const tables = ['empresas', 'colaboradores', 'respostas', 'banco_cenarios', 'trilhas', 'capacitacao'];
  const health = {};
  for (const t of tables) {
    try {
      const { error } = await sb.from(t).select('id', { count: 'exact', head: true });
      health[t] = error ? 'ERRO' : 'OK';
    } catch {
      health[t] = 'ERRO';
    }
  }

  return {
    empresas: enriched,
    totalColabs: colabs.length,
    totalAvaliacoes: respostasRes.count || 0,
    totalPDIs: respostasRes.count || 0, // Usando respostas avaliadas como proxy
    totalCenarios: cenariosRes.count || 0,
    totalTrilhas: trilhasRes.count || 0,
    totalCapacitacao: capacitacaoRes.count || 0,
    health,
  };
}
