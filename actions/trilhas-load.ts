'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadTrilhas(empresaId: string) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('trilhas')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false });

  if (!data?.length) return [];

  const colabIds = [...new Set(data.map(t => t.colaborador_id).filter(Boolean))];
  const colabMap: Record<string, any> = {};
  if (colabIds.length) {
    const { data: colabs } = await sb.from('colaboradores').select('id, nome_completo, cargo').in('id', colabIds);
    (colabs || []).forEach(c => { colabMap[c.id] = c; });
  }

  // Busca nota/nivel da competência foco em respostas (IA4) pra cada trilha
  const focoMap: Record<string, any> = {};
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

  // Pré-carrega TODO catálogo pra poder calcular "saiba mais"
  const empresaIds = [...new Set(data.map(t => t.empresa_id))];
  const competencias = [...new Set(data.map(t => t.competencia_foco).filter(Boolean))];
  const { data: catalogo } = competencias.length > 0
    ? await sb.from('micro_conteudos')
        .select('id, titulo, formato, url, competencia, descritor, nivel_min, nivel_max, cargo, taxa_conclusao')
        .eq('ativo', true)
        .in('competencia', competencias)
    : { data: [] };

  return data.map(t => {
    const plano = Array.isArray(t.temporada_plano) ? t.temporada_plano : (typeof t.temporada_plano === 'string' ? JSON.parse(t.temporada_plano) : null);
    const cursosLegacy = typeof t.cursos === 'string' ? JSON.parse(t.cursos) : (t.cursos || []);

    let obrigatorios = [];
    let saibaMais = [];

    if (plano && plano.length > 0) {
      // Mapa rápido: descritor → notaAtual (vem de descritores_selecionados na trilha)
      const descSel = Array.isArray(t.descritores_selecionados) ? t.descritores_selecionados : [];
      const notaPorDescritor = Object.fromEntries(descSel.map(d => [d.descritor, d.nota_atual]));

      // Extrai semanas (conteúdo + aplicação) do temporada_plano
      const idsUsados = new Set();
      for (const sem of plano) {
        if (sem.tipo === 'conteudo' && sem.conteudo) {
          const cid = sem.conteudo.core_id;
          if (cid) idsUsados.add(cid);
          obrigatorios.push({
            tipo: 'conteudo',
            semana: sem.semana,
            descritor: sem.descritor,
            nota_descritor: notaPorDescritor[sem.descritor] ?? sem.nivel_atual ?? null,
            formato: sem.conteudo.formato_core,
            nome: sem.conteudo.core_titulo || sem.descritor,
            url: sem.conteudo.core_url,
            desafio: sem.conteudo.desafio_texto,
            nivel: sem.nivel_atual,
          });
        } else if (sem.tipo === 'aplicacao') {
          obrigatorios.push({
            tipo: 'aplicacao',
            semana: sem.semana,
            nome: `Aplicação prática (${sem.cenario?.complexidade || 'cenário'})`,
            descritores_cobertos: sem.descritores_cobertos || [],
            cenario: sem.cenario?.texto || '',
          });
        } else if (sem.tipo === 'avaliacao') {
          obrigatorios.push({
            tipo: 'avaliacao',
            semana: sem.semana,
            nome: 'Avaliação de fim de temporada',
          });
        }
      }
      // Saiba mais = conteúdos da mesma competência não usados como core
      const cargo = colabMap[t.colaborador_id]?.cargo;
      const poolSaiba = (catalogo || [])
        .filter(c => c.competencia === t.competencia_foco)
        .filter(c => !idsUsados.has(c.id))
        .filter(c => !c.cargo || c.cargo === 'todos' || c.cargo === cargo)
        .map(c => ({
          course_id: c.id,
          nome: c.titulo,
          url: c.url || '',
          formato: c.formato,
          competencia: c.competencia,
          descritor: c.descritor,
          nivel: Math.round(((c.nivel_min || 1) + (c.nivel_max || 4)) / 2),
        }));
      // Atrela até 2 "Saiba mais" por semana de conteúdo (match descritor)
      const usadosSaiba = new Set();
      for (const item of obrigatorios) {
        if (item.tipo !== 'conteudo') continue;
        const sugest = poolSaiba
          .filter(c => c.descritor === item.descritor && !usadosSaiba.has(c.course_id))
          .slice(0, 2);
        sugest.forEach(s => usadosSaiba.add(s.course_id));
        item.saiba_mais = sugest;
      }
      // Sobra do saiba mais (sem match de descritor) vai pro bloco geral
      saibaMais = poolSaiba.filter(c => !usadosSaiba.has(c.course_id));
    } else {
      // Fallback (trilha legacy sem temporada_plano)
      obrigatorios = cursosLegacy;
    }

    return {
      ...t,
      colaborador_nome: colabMap[t.colaborador_id]?.nome_completo || '—',
      colaborador_cargo: colabMap[t.colaborador_id]?.cargo || '—',
      foco_nivel: focoMap[t.id]?.nivel_ia4 || null,
      foco_nota: focoMap[t.id]?.nota_ia4 || null,
      cursos: obrigatorios,
      saiba_mais: saibaMais,
    };
  });
}
