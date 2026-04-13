'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

// As 8 preferências mapeadas no fim do mapeamento comportamental.
// Cada coluna é INT 1-5 (escala de Likert).
export const PREFS = [
  { key: 'pref_video_curto', label: 'Vídeos curtos', icon: 'Video' },
  { key: 'pref_video_longo', label: 'Vídeos longos / aulas', icon: 'Film' },
  { key: 'pref_texto', label: 'Texto / artigos', icon: 'FileText' },
  { key: 'pref_audio', label: 'Áudios / podcasts', icon: 'Headphones' },
  { key: 'pref_infografico', label: 'Infográficos', icon: 'BarChart3' },
  { key: 'pref_exercicio', label: 'Exercícios práticos', icon: 'Dumbbell' },
  { key: 'pref_mentor', label: 'Mentoria 1:1', icon: 'Users' },
  { key: 'pref_estudo_caso', label: 'Estudo de caso', icon: 'BookOpen' },
];

const COLS = PREFS.map(p => p.key).join(', ');

function calcularRanking(rows) {
  const totais = Object.fromEntries(PREFS.map(p => [p.key, { soma: 0, n: 0 }]));
  for (const r of rows) {
    for (const p of PREFS) {
      const v = Number(r[p.key]);
      if (Number.isFinite(v) && v > 0) {
        totais[p.key].soma += v;
        totais[p.key].n += 1;
      }
    }
  }
  const ranking = PREFS.map(p => {
    const t = totais[p.key];
    const media = t.n > 0 ? Math.round((t.soma / t.n) * 100) / 100 : 0;
    return { ...p, media, respondentes: t.n };
  });
  ranking.sort((a, b) => b.media - a.media);
  return ranking;
}

/**
 * Retorna o consolidado das preferências de aprendizagem da empresa:
 * - total de colaboradores na empresa
 * - quantos preencheram (têm pelo menos uma preferência)
 * - ranking decrescente por média (1-5)
 */
export async function loadPreferenciasEmpresa(empresaId) {
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
}

/**
 * Consolidado global: por empresa + médias gerais.
 */
export async function loadPreferenciasGlobais() {
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
}
