'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadTrilhas(empresaId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('trilhas')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false });

  if (!data?.length) return [];

  const colabIds = [...new Set(data.map(t => t.colaborador_id).filter(Boolean))];
  const colabMap = {};
  if (colabIds.length) {
    const { data: colabs } = await sb.from('colaboradores').select('id, nome_completo, cargo').in('id', colabIds);
    (colabs || []).forEach(c => { colabMap[c.id] = c; });
  }

  return data.map(t => ({
    ...t,
    colaborador_nome: colabMap[t.colaborador_id]?.nome_completo || '—',
    colaborador_cargo: colabMap[t.colaborador_id]?.cargo || '—',
    cursos: typeof t.cursos === 'string' ? JSON.parse(t.cursos) : (t.cursos || []),
  }));
}
