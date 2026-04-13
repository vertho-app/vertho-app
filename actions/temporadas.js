'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';
import { selectDescriptors } from '@/lib/season-engine/select-descriptors';
import { buildSeason } from '@/lib/season-engine/build-season';

/**
 * Wrapper: carrega temporada do colab logado via email.
 */
export async function loadTemporadaPorEmail(email) {
  try {
    const colab = await findColabByEmail(email, 'id');
    if (!colab) return { error: 'Colab não encontrado' };
    return loadTemporada(colab.id);
  } catch (err) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Gera uma temporada de 14 semanas pra um colaborador, focada em 1 competência.
 *
 * @param {Object} params
 * @param {string} params.colaboradorId
 * @param {string} params.competencia - se não passado, busca de competencias_foco
 * @param {Object} params.aiConfig - opcional
 */
export async function gerarTemporada({ colaboradorId, competencia, aiConfig } = {}) {
  try {
    if (!colaboradorId) return { error: 'colaboradorId obrigatório' };
    const sb = createSupabaseAdmin();

    const { data: colab } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, empresa_id, area_depto, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso')
      .eq('id', colaboradorId).maybeSingle();
    if (!colab) return { error: 'Colaborador não encontrado' };

    // 1) Determina competência foco — usa trilha existente se nada explícito
    let competenciaAlvo = competencia;
    if (!competenciaAlvo) {
      const { data: trilhaExist } = await sb.from('trilhas')
        .select('competencia_foco')
        .eq('colaborador_id', colaboradorId)
        .order('criado_em', { ascending: false })
        .limit(1).maybeSingle();
      competenciaAlvo = trilhaExist?.competencia_foco;
    }
    if (!competenciaAlvo) return { error: 'Sem competência foco definida pra este colaborador' };

    // 2) Descobre contexto/setor da empresa
    const { data: empresa } = await sb.from('empresas')
      .select('segmento').eq('id', colab.empresa_id).maybeSingle();
    const contexto = inferirContexto(empresa?.segmento);

    // 3) Prioridade de formatos — derivada das colunas pref_* em colaboradores
    const prioridadeFormatos = derivarPrioridadeFormatos(colab);

    // 4) Assessment de descritores
    let { data: assessment } = await sb.from('descriptor_assessments')
      .select('descritor, nota')
      .eq('colaborador_id', colaboradorId)
      .eq('competencia', competenciaAlvo);

    // Fallback em cascata:
    //   1. competencias da empresa do colab (com nome_curto preenchido)
    //   2. competencias de qualquer empresa (algum admin já cadastrou)
    //   3. competencias_base (global)
    if (!assessment || assessment.length === 0) {
      const { data: emp } = await sb.from('competencias')
        .select('nome_curto')
        .eq('empresa_id', colab.empresa_id)
        .eq('nome', competenciaAlvo)
        .not('nome_curto', 'is', null);
      let descritoresUnicos = [...new Set((emp || []).map(b => b.nome_curto))];

      if (descritoresUnicos.length === 0) {
        const { data: qualquerEmp } = await sb.from('competencias')
          .select('nome_curto')
          .eq('nome', competenciaAlvo)
          .not('nome_curto', 'is', null);
        descritoresUnicos = [...new Set((qualquerEmp || []).map(b => b.nome_curto))];
      }

      if (descritoresUnicos.length === 0) {
        const { data: base } = await sb.from('competencias_base')
          .select('nome_curto').eq('nome', competenciaAlvo).not('nome_curto', 'is', null);
        descritoresUnicos = [...new Set((base || []).map(b => b.nome_curto))];
      }

      assessment = descritoresUnicos.map(d => ({ descritor: d, nota: 1.5 }));
    }

    if (assessment.length === 0) {
      return { error: `Competência "${competenciaAlvo}" sem descritores cadastrados — pule esta competência ou cadastre os descritores antes` };
    }

    // 5) Seleciona descritores e aloca semanas
    const descritoresSelecionados = selectDescriptors(assessment);

    // 6) Monta plano de 14 semanas (com IA pra desafios + cenários)
    const semanas = await buildSeason({
      descritoresSelecionados,
      competencia: competenciaAlvo,
      cargo: colab.cargo,
      contexto,
      prioridadeFormatos,
      empresaId: colab.empresa_id,
      aiConfig,
    });

    // 7) Persiste em trilhas (estende registro existente ou cria novo)
    const { data: existente } = await sb.from('trilhas')
      .select('id, numero_temporada')
      .eq('colaborador_id', colaboradorId)
      .eq('empresa_id', colab.empresa_id)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle();

    const numeroTemporada = (existente?.numero_temporada || 0) + 1;
    const payload = {
      empresa_id: colab.empresa_id,
      colaborador_id: colaboradorId,
      competencia_foco: competenciaAlvo,
      numero_temporada: numeroTemporada,
      temporada_plano: semanas,
      descritores_selecionados: descritoresSelecionados,
      status: 'ativa',
      cursos: [], // legado moodle, vazio na nova era
    };

    let trilhaId;
    if (existente && numeroTemporada === 1) {
      // Sobrescreve a primeira temporada se ainda não rodou
      const { error } = await sb.from('trilhas').update(payload).eq('id', existente.id);
      if (error) return { error: error.message };
      trilhaId = existente.id;
    } else {
      const { data: nova, error } = await sb.from('trilhas').insert(payload).select('id').maybeSingle();
      if (error) return { error: error.message };
      trilhaId = nova.id;
    }

    // 8) Cria registros de progresso (semana 1 = disponível, demais = bloqueada)
    const progressos = semanas.map(s => ({
      trilha_id: trilhaId,
      empresa_id: colab.empresa_id,
      colaborador_id: colaboradorId,
      semana: s.semana,
      tipo: s.tipo,
      status: s.semana === 1 ? 'em_andamento' : 'pendente',
    }));
    await sb.from('temporada_semana_progresso').delete().eq('trilha_id', trilhaId);
    await sb.from('temporada_semana_progresso').insert(progressos);

    return {
      ok: true,
      trilhaId,
      numeroTemporada,
      competencia: competenciaAlvo,
      descritores: descritoresSelecionados.length,
      semanas: semanas.length,
    };
  } catch (err) {
    console.error('[gerarTemporada]', err);
    return { error: err?.message || 'Erro' };
  }
}

function derivarPrioridadeFormatos(colab) {
  // Mapeia colunas pref_* (1-5 likert) → ordem dos formatos do motor
  const scores = [
    { f: 'video', s: Math.max(Number(colab.pref_video_curto || 0), Number(colab.pref_video_longo || 0)) },
    { f: 'texto', s: Number(colab.pref_texto || 0) },
    { f: 'audio', s: Number(colab.pref_audio || 0) },
    { f: 'case',  s: Number(colab.pref_estudo_caso || 0) },
  ];
  const ordenado = scores.sort((a, b) => b.s - a.s).map(x => x.f);
  // Se tudo for 0 (sem preferência declarada), default sensato
  if (scores.every(s => s.s === 0)) return ['video', 'texto', 'audio', 'case'];
  return ordenado;
}

function inferirContexto(segmento) {
  if (!segmento) return 'generico';
  const s = String(segmento).toLowerCase();
  if (s.includes('educa') || s.includes('escola')) return 'educacional';
  if (s.includes('saude') || s.includes('saúde')) return 'corporativo';
  return 'corporativo';
}

/**
 * Gera temporadas para todos os colaboradores de uma empresa que têm
 * competência foco definida (em trilhas existentes ou no parametro).
 */
export async function gerarTemporadasLote(empresaId, aiConfig) {
  try {
    if (!empresaId) return { error: 'empresaId obrigatório' };
    const sb = createSupabaseAdmin();
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo').eq('empresa_id', empresaId);
    if (!colabs?.length) return { error: 'Sem colaboradores' };

    const resultados = [];
    for (const c of colabs) {
      const r = await gerarTemporada({ colaboradorId: c.id, aiConfig });
      resultados.push({ colab: c.nome_completo, ...r });
    }
    const ok = resultados.filter(r => r.ok).length;
    const errosUnicos = [...new Set(resultados.filter(r => !r.ok).map(r => r.error))].slice(0, 3);
    return {
      success: true,
      total: colabs.length,
      gerados: ok,
      resultados,
      message: `${ok}/${colabs.length} temporadas geradas${errosUnicos.length ? ` · erros: ${errosUnicos.join('; ')}` : ''}`,
    };
  } catch (err) {
    console.error('[gerarTemporadasLote]', err);
    return { success: false, error: err?.message || 'Erro' };
  }
}

/**
 * Lista temporadas de uma empresa (admin viewer).
 */
export async function listarTemporadasEmpresa(empresaId) {
  try {
    const sb = createSupabaseAdmin();
    let q = sb.from('trilhas')
      .select('id, colaborador_id, competencia_foco, numero_temporada, status, criado_em, descritores_selecionados, temporada_plano')
      .not('temporada_plano', 'is', null);
    if (empresaId) q = q.eq('empresa_id', empresaId);
    const { data, error } = await q.order('criado_em', { ascending: false });
    if (error) return { error: error.message };

    const ids = (data || []).map(t => t.colaborador_id);
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo').in('id', ids);
    const colabMap = Object.fromEntries((colabs || []).map(c => [c.id, c]));

    return { items: (data || []).map(t => ({ ...t, colab: colabMap[t.colaborador_id] || null })) };
  } catch (err) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Marca o conteúdo core de uma semana como consumido.
 */
export async function marcarConteudoConsumido(trilhaId, semana) {
  try {
    const sb = createSupabaseAdmin();
    const { data: existente } = await sb.from('temporada_semana_progresso')
      .select('id, iniciado_em').eq('trilha_id', trilhaId).eq('semana', semana).maybeSingle();
    const payload = {
      conteudo_consumido: true,
      status: 'em_andamento',
      iniciado_em: existente?.iniciado_em || new Date().toISOString(),
    };
    if (existente) {
      await sb.from('temporada_semana_progresso').update(payload).eq('id', existente.id);
    } else {
      const { data: t } = await sb.from('trilhas').select('empresa_id, colaborador_id, temporada_plano').eq('id', trilhaId).maybeSingle();
      const tipo = (t?.temporada_plano || []).find(s => s.semana === semana)?.tipo || 'conteudo';
      await sb.from('temporada_semana_progresso').insert({
        trilha_id: trilhaId, empresa_id: t.empresa_id, colaborador_id: t.colaborador_id,
        semana, tipo, ...payload,
      });
    }
    return { ok: true };
  } catch (err) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Carrega a temporada ativa de um colaborador (com plano + progresso).
 */
export async function loadTemporada(colaboradorId) {
  try {
    if (!colaboradorId) return { error: 'colaboradorId obrigatório' };
    const sb = createSupabaseAdmin();
    const { data: trilha } = await sb.from('trilhas')
      .select('*').eq('colaborador_id', colaboradorId)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (!trilha) return { error: 'Sem temporada' };

    const { data: progresso } = await sb.from('temporada_semana_progresso')
      .select('*').eq('trilha_id', trilha.id).order('semana');

    return { ok: true, trilha, progresso: progresso || [] };
  } catch (err) {
    return { error: err?.message || 'Erro' };
  }
}
