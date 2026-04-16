'use server';

import { tenantDb } from '@/lib/tenant-db';

export async function loadRelatoriosEmpresa(empresaId: string) {
  if (!empresaId) return { individuais: [], gestores: [], gestor: null, rh: null };
  const tdb = tenantDb(empresaId);

  const { data, error } = await tdb.from('relatorios')
    .select('id, empresa_id, colaborador_id, tipo, conteudo, gerado_em')
    .order('gerado_em', { ascending: false });

  if (error || !data?.length) return { individuais: [], gestores: [], gestor: null, rh: null };

  // Buscar nomes dos colaboradores
  const colabIds = [...new Set(data.map(r => r.colaborador_id).filter(Boolean))];
  const colabMap: Record<string, any> = {};
  if (colabIds.length) {
    const { data: colabs } = await tdb.from('colaboradores').select('id, nome_completo, cargo').in('id', colabIds);
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

  const gestores = data
    .filter(r => r.tipo === 'gestor')
    .map(r => {
      const conteudo = typeof r.conteudo === 'string' ? JSON.parse(r.conteudo) : r.conteudo;
      return {
        ...r,
        conteudo,
        gestor_nome: conteudo?.gestor_nome || colabMap[r.colaborador_id]?.nome_completo || '—',
        gestor_email: conteudo?.gestor_email || null,
        equipe_size: Array.isArray(conteudo?.ranking_atencao) ? conteudo.ranking_atencao.length : null,
      };
    });
  const gestor = gestores[0] || null;

  const rhRaw = data.find(r => r.tipo === 'rh');
  const rh = rhRaw ? {
    ...rhRaw,
    conteudo: typeof rhRaw.conteudo === 'string' ? JSON.parse(rhRaw.conteudo) : rhRaw.conteudo,
  } : null;

  return { individuais, gestores, gestor, rh };
}
