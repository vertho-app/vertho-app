'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadEmpresas() {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('empresas').select('id, nome').order('nome');
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function loadWhatsappStatus(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const [enviosRes, relatoriosRes] = await Promise.all([
      sb.from('envios_diagnostico')
        .select('id, status', { count: 'exact' })
        .eq('empresa_id', empresaId)
        .eq('status', 'pendente'),
      sb.from('relatorios')
        .select('id', { count: 'exact' })
        .eq('empresa_id', empresaId)
        .eq('tipo', 'individual'),
    ]);

    return {
      success: true,
      data: {
        pendingCIS: enviosRes.count || 0,
        totalRelatorios: relatoriosRes.count || 0,
      },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function loadColaboradoresEnvio(empresaId) {
  const sb = createSupabaseAdmin();
  // Tentar com telefone, fallback sem
  let data;
  const { data: d1, error: e1 } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, telefone')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  if (!e1) {
    data = d1;
  } else {
    const { data: d2 } = await sb.from('colaboradores')
      .select('id, nome_completo, email, cargo')
      .eq('empresa_id', empresaId)
      .order('nome_completo');
    data = (d2 || []).map(c => ({ ...c, telefone: null }));
  }
  return data || [];
}
