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

  // Busca nota/nivel da competência foco em respostas (IA4) pra cada trilha
  const focoMap = {};
  for (const t of data) {
    if (!t.competencia_foco || !t.colaborador_id) continue;
    const { data: resp } = await sb.from('respostas')
      .select('nivel_ia4, nota_ia4')
      .eq('colaborador_id', t.colaborador_id)
      .eq('competencia_nome', t.competencia_foco)
      .not('nivel_ia4', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    focoMap[t.id] = resp || null;
  }

  return data.map(t => ({
    ...t,
    colaborador_nome: colabMap[t.colaborador_id]?.nome_completo || '—',
    colaborador_cargo: colabMap[t.colaborador_id]?.cargo || '—',
    foco_nivel: focoMap[t.id]?.nivel_ia4 || null,
    foco_nota: focoMap[t.id]?.nota_ia4 || null,
    cursos: typeof t.cursos === 'string' ? JSON.parse(t.cursos) : (t.cursos || []),
  }));
}
