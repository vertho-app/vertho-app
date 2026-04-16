'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { COLS, calcularRanking } from '@/lib/preferencias-config';

/**
 * Consolidado das preferências de aprendizagem da empresa.
 */
export async function loadPreferenciasEmpresa(empresaId: string) {
  try {
    if (!empresaId) return { error: 'empresa obrigatória' };
    const tdb = tenantDb(empresaId);

    const { count: totalColabs } = await tdb.from('colaboradores')
      .select('id', { count: 'exact', head: true });

    const { data: rows, error } = await tdb.from('colaboradores')
      .select(COLS)
      .not('pref_video_curto', 'is', null);

    if (error) return { error: error.message };

    const respondentes = rows?.length || 0;
    const ranking = calcularRanking(rows || []);

    return {
      totalColabs: totalColabs || 0,
      respondentes,
      ranking,
    };
  } catch (err) {
    console.error('[loadPreferenciasEmpresa]', err);
    return { error: err?.message || 'Falha ao carregar preferências' };
  }
}

/**
 * Consolidado global: por empresa + médias gerais.
 */
export async function loadPreferenciasGlobais() {
  try {
    const sb = createSupabaseAdmin();

    const { data: empresas, error: e1 } = await sb.from('empresas')
      .select('id, nome').order('nome');
    if (e1) return { error: e1.message };

    const { data: rows, error: e2 } = await sb.from('colaboradores')
      .select(`empresa_id, ${COLS}` as any)
      .not('pref_video_curto', 'is', null);
    if (e2) return { error: e2.message };

    const porEmpresa = (empresas || []).map(emp => {
      const subset = ((rows as any[]) || []).filter(r => r.empresa_id === emp.id);
      return {
        empresaId: emp.id,
        empresaNome: emp.nome,
        respondentes: subset.length,
        ranking: calcularRanking(subset),
      };
    }).filter(e => e.respondentes > 0);

    const rankingGlobal = calcularRanking((rows as any[]) || []);

    return {
      totalRespondentes: rows?.length || 0,
      totalEmpresas: (empresas || []).length,
      empresasComDados: porEmpresa.length,
      rankingGlobal,
      porEmpresa,
    };
  } catch (err) {
    console.error('[loadPreferenciasGlobais]', err);
    return { error: err?.message || 'Falha ao carregar preferências globais' };
  }
}
