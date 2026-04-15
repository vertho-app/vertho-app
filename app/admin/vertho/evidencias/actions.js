'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext } from '@/lib/authz';

/**
 * Lista Evidências semanais (conversas socráticas das sems 1-12)
 * de todas as empresas. Exibe extrações estruturadas (insight, qualidade,
 * desafio_realizado) + meta da conversa.
 */
export async function listarEvidencias(email, filtros = {}) {
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return { error: 'Acesso restrito à Vertho' };

  const sb = createSupabaseAdmin();
  const limit = filtros.limit || 100;

  let q = sb.from('temporada_semana_progresso')
    .select(`
      id, trilha_id, colaborador_id, empresa_id, semana, status, concluido_em, reflexao,
      colaboradores!inner(nome_completo, cargo),
      empresas!inner(nome),
      trilhas!inner(competencia_foco, temporada_plano)
    `)
    .eq('tipo', 'conteudo')
    .eq('status', 'concluido')
    .not('reflexao', 'is', null)
    .order('concluido_em', { ascending: false })
    .limit(limit);

  if (filtros.empresaId) q = q.eq('empresa_id', filtros.empresaId);
  if (filtros.qualidade) {
    // filtro client-side depois (JSONB nested)
  }

  const { data, error } = await q;
  if (error) return { error: error.message };

  const rows = (data || []).map(r => {
    const ref = r.reflexao || {};
    const plano = Array.isArray(r.trilhas?.temporada_plano) ? r.trilhas.temporada_plano : [];
    const descritor = plano.find(s => s.semana === r.semana)?.descritor || '—';
    return {
      id: r.id,
      trilhaId: r.trilha_id,
      semana: r.semana,
      colaborador: r.colaboradores?.nome_completo,
      cargo: r.colaboradores?.cargo,
      empresa: r.empresas?.nome,
      competencia: r.trilhas?.competencia_foco,
      descritor,
      concluidoEm: r.concluido_em,
      insight: ref.insight_principal || null,
      desafioRealizado: ref.desafio_realizado || null,
      qualidade: ref.qualidade_reflexao || null,
      compromissoProxima: ref.compromisso_proxima || null,
      relatoResumo: ref.relato_resumo || null,
    };
  });

  const filtered = filtros.qualidade && filtros.qualidade !== 'todos'
    ? rows.filter(r => r.qualidade === filtros.qualidade)
    : rows;

  const resumo = {
    total: rows.length,
    alta: rows.filter(r => r.qualidade === 'alta').length,
    media: rows.filter(r => r.qualidade === 'media').length,
    baixa: rows.filter(r => r.qualidade === 'baixa').length,
    desafio_sim: rows.filter(r => r.desafioRealizado === 'sim').length,
    desafio_parcial: rows.filter(r => r.desafioRealizado === 'parcial').length,
    desafio_nao: rows.filter(r => r.desafioRealizado === 'nao').length,
  };

  return { ok: true, rows: filtered, resumo };
}

/**
 * Detalhe completo: transcript da conversa + extração estruturada.
 */
export async function loadEvidenciaDetalhe(email, progressoId) {
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return { error: 'Acesso restrito à Vertho' };

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('temporada_semana_progresso')
    .select(`
      id, trilha_id, semana, concluido_em, reflexao,
      colaboradores!inner(nome_completo, cargo, perfil_dominante),
      empresas!inner(nome),
      trilhas!inner(competencia_foco, temporada_plano)
    `)
    .eq('id', progressoId).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Registro não encontrado' };

  const plano = Array.isArray(data.trilhas?.temporada_plano) ? data.trilhas.temporada_plano : [];
  const semanaPlan = plano.find(s => s.semana === data.semana) || {};

  const ref = data.reflexao || {};
  return {
    ok: true,
    detalhe: {
      semana: data.semana,
      colaborador: data.colaboradores?.nome_completo,
      cargo: data.colaboradores?.cargo,
      perfilDominante: data.colaboradores?.perfil_dominante,
      empresa: data.empresas?.nome,
      competencia: data.trilhas?.competencia_foco,
      descritor: semanaPlan.descritor,
      desafio: semanaPlan.conteudo?.desafio_texto,
      concluidoEm: data.concluido_em,
      extracao: {
        insight_principal: ref.insight_principal,
        desafio_realizado: ref.desafio_realizado,
        qualidade_reflexao: ref.qualidade_reflexao,
        compromisso_proxima: ref.compromisso_proxima,
        relato_resumo: ref.relato_resumo,
      },
      transcript: Array.isArray(ref.transcript_completo) ? ref.transcript_completo : [],
    },
  };
}
