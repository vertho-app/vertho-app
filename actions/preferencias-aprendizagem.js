'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { COLS, calcularRanking } from '@/lib/preferencias-config';

/**
 * Consolidado das preferências de aprendizagem da empresa.
 */
export async function loadPreferenciasEmpresa(empresaId) {
  try {
    if (!empresaId) return { error: 'empresa obrigatória' };
    const sb = createSupabaseAdmin();

    const { count: totalColabs } = await sb.from('colaboradores')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId);

    const { data: rows, error } = await sb.from('colaboradores')
      .select(COLS)
      .eq('empresa_id', empresaId)
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
      .select(`empresa_id, ${COLS}`)
      .not('pref_video_curto', 'is', null);
    if (e2) return { error: e2.message };

    const porEmpresa = (empresas || []).map(emp => {
      const subset = (rows || []).filter(r => r.empresa_id === emp.id);
      return {
        empresaId: emp.id,
        empresaNome: emp.nome,
        respondentes: subset.length,
        ranking: calcularRanking(subset),
      };
    }).filter(e => e.respondentes > 0);

    const rankingGlobal = calcularRanking(rows || []);

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
