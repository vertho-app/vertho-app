'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadEmpresas() {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('empresas').select('id, nome, segmento').order('nome');
  return data || [];
}

export async function loadResumoEmpresa(empresaId) {
  const sb = createSupabaseAdmin();
  const { count: colabs } = await sb.from('colaboradores')
    .select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId);
  const { data: comps } = await sb.from('competencias')
    .select('cod_comp').eq('empresa_id', empresaId);
  return { colabs: colabs || 0, competencias: comps?.length || 0 };
}

export async function importarColaboradoresLote(empresaId, colabs) {
  const sb = createSupabaseAdmin();
  const { data: existentes } = await sb.from('colaboradores')
    .select('email').eq('empresa_id', empresaId);
  const emailsExistentes = new Set((existentes || []).map(c => c.email.toLowerCase()));

  const novos = colabs
    .filter(c => c.email && !emailsExistentes.has(c.email.toLowerCase()))
    .map(c => ({
      empresa_id: empresaId,
      nome_completo: c.nome?.trim() || null,
      email: c.email.trim().toLowerCase(),
      cargo: c.cargo?.trim() || null,
    }));

  if (novos.length === 0) return { success: true, message: '0 novos (todos já existiam)' };

  const { error } = await sb.from('colaboradores').insert(novos);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${novos.length} colaboradores importados` };
}
