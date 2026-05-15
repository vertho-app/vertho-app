'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { derivarArquetipo, derivarTagsExecutivas } from '@/lib/disc-arquetipos';

const SELECT_COLS = `
  id, nome_completo, email, cargo, area_depto, role,
  perfil_dominante, mapeamento_em,
  d_natural, i_natural, s_natural, c_natural,
  d_adaptado, i_adaptado, s_adaptado, c_adaptado,
  lid_executivo, lid_motivador, lid_metodico, lid_sistematico,
  tp_introvertido_extrovertido, tp_sensor_intuitivo, tp_racional_emocional,
  comportamental_pdf_path, report_generated_at,
  insights_executivos, insights_executivos_at
`;

export async function loadPerfisComportamentaisEmpresa(empresaId: string) {
  try {
    const sb = await requireAdminSupabase();
    if (!empresaId) return { error: 'empresaId obrigatório' };

    const { data, error } = await sb.from('colaboradores')
      .select(SELECT_COLS)
      .eq('empresa_id', empresaId)
      .order('nome_completo', { ascending: true });

    if (error) return { error: error.message };

    const perfis = (data || []).map((c: any) => {
      const hasDisc = !!(c.perfil_dominante && (c.d_natural || c.i_natural || c.s_natural || c.c_natural));
      return {
        id: c.id,
        nome: c.nome_completo || '—',
        email: c.email,
        cargo: c.cargo || '—',
        area: c.area_depto || null,
        role: c.role || 'colaborador',
        hasDisc,
        perfilDominante: c.perfil_dominante || null,
        arquetipo: hasDisc ? derivarArquetipo(c.perfil_dominante) : null,
        tags: hasDisc ? derivarTagsExecutivas(c) : [],
        disc: hasDisc ? {
          natural: { d: Number(c.d_natural) || 0, i: Number(c.i_natural) || 0, s: Number(c.s_natural) || 0, c: Number(c.c_natural) || 0 },
          adaptado: { d: Number(c.d_adaptado) || 0, i: Number(c.i_adaptado) || 0, s: Number(c.s_adaptado) || 0, c: Number(c.c_adaptado) || 0 },
        } : null,
        lideranca: hasDisc ? {
          exec: Number(c.lid_executivo) || 0,
          mot: Number(c.lid_motivador) || 0,
          met: Number(c.lid_metodico) || 0,
          sis: Number(c.lid_sistematico) || 0,
        } : null,
        mapeamentoEm: c.mapeamento_em || null,
        relatorioCacheEm: c.report_generated_at || null,
        hasPdf: !!c.comportamental_pdf_path,
        hasInsights: Array.isArray(c.insights_executivos) && c.insights_executivos.length > 0,
        insights: Array.isArray(c.insights_executivos) ? c.insights_executivos : [],
      };
    });

    const completos = perfis.filter(p => p.hasDisc).length;
    const total = perfis.length;
    return {
      perfis,
      stats: {
        total,
        completos,
        pendentes: total - completos,
        pctCompletos: total > 0 ? Math.round((completos / total) * 100) : 0,
        comPdf: perfis.filter(p => p.hasPdf).length,
      },
    };
  } catch (err: any) {
    console.error('[loadPerfisComportamentaisEmpresa]', err);
    return { error: err?.message || 'Erro ao carregar perfis' };
  }
}
