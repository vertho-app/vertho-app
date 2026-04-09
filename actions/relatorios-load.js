'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadRelatoriosEmpresa(empresaId) {
  const sb = createSupabaseAdmin();

  const { data, error } = await sb.from('relatorios')
    .select('id, empresa_id, colaborador_id, tipo, conteudo, gerado_em')
    .eq('empresa_id', empresaId)
    .order('gerado_em', { ascending: false });

  if (error || !data?.length) return { individuais: [], gestor: null, rh: null };

  // Buscar nomes dos colaboradores
  const colabIds = [...new Set(data.map(r => r.colaborador_id).filter(Boolean))];
  const colabMap = {};
  if (colabIds.length) {
    const { data: colabs } = await sb.from('colaboradores').select('id, nome_completo, cargo').in('id', colabIds);
    (colabs || []).forEach(c => { colabMap[c.id] = c; });
  }

  const individuais = data
    .filter(r => r.tipo === 'individual')
    .map(r => ({
      ...r,
      conteudo: typeof r.conteudo === 'string' ? JSON.parse(r.conteudo) : r.conteudo,
      colaborador_nome: colabMap[r.colaborador_id]?.nome_completo || '—',
      colaborador_cargo: colabMap[r.colaborador_id]?.cargo || '—',
    }));

  const gestorRaw = data.find(r => r.tipo === 'gestor');
  const gestor = gestorRaw ? {
    ...gestorRaw,
    conteudo: typeof gestorRaw.conteudo === 'string' ? JSON.parse(gestorRaw.conteudo) : gestorRaw.conteudo,
  } : null;

  const rhRaw = data.find(r => r.tipo === 'rh');
  const rh = rhRaw ? {
    ...rhRaw,
    conteudo: typeof rhRaw.conteudo === 'string' ? JSON.parse(rhRaw.conteudo) : rhRaw.conteudo,
  } : null;

  return { individuais, gestor, rh };
}
