'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext } from '@/lib/authz';

/**
 * Lista auditorias da semana 14 de todas as empresas.
 * Só platform admin Vertho acessa.
 *
 * @param {string} email do usuário autenticado
 * @param {Object} filtros { status: 'todos'|'aprovado'|'revisar', empresaId?, limit? }
 */
export async function listarAuditoriasSem14(email, filtros = {}) {
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return { error: 'Acesso restrito à Vertho' };

  const sb = createSupabaseAdmin();
  const limit = filtros.limit || 50;

  // Sem 14 concluída + com auditoria preenchida
  let q = sb.from('temporada_semana_progresso')
    .select(`
      id, trilha_id, colaborador_id, empresa_id, semana, status,
      concluido_em, feedback,
      colaboradores!inner(nome_completo, cargo, email),
      empresas!inner(nome),
      trilhas!inner(competencia_foco, numero_temporada)
    `)
    .eq('semana', 14)
    .eq('status', 'concluido')
    .not('feedback', 'is', null)
    .order('concluido_em', { ascending: false })
    .limit(limit);

  if (filtros.empresaId) q = q.eq('empresa_id', filtros.empresaId);

  const { data, error } = await q;
  if (error) return { error: error.message };

  // Filtra client-side pelo status da auditoria (JSONB não é trivial no Supabase filter)
  const rows = (data || []).map(r => {
    const fb = r.feedback || {};
    const auditoria = fb.auditoria || null;
    return {
      id: r.id,
      trilhaId: r.trilha_id,
      colaborador: r.colaboradores?.nome_completo,
      cargo: r.colaboradores?.cargo,
      email: r.colaboradores?.email,
      empresa: r.empresas?.nome,
      empresaId: r.empresa_id,
      competencia: r.trilhas?.competencia_foco,
      temporada: r.trilhas?.numero_temporada,
      concluidoEm: r.concluido_em,
      notaMediaPre: fb.nota_media_pre || null,
      notaMediaPos: fb.nota_media_pos || null,
      deltaMedio: fb.delta_medio || null,
      auditoriaNota: auditoria?.nota_auditoria ?? null,
      auditoriaStatus: auditoria?.status || 'sem_auditoria',
      auditoriaAlertas: auditoria?.alertas || [],
      auditoriaResumo: auditoria?.resumo_auditoria || null,
      ajustesSugeridos: auditoria?.ajustes_sugeridos || [],
    };
  });

  const filtered = filtros.status && filtros.status !== 'todos'
    ? rows.filter(r => r.auditoriaStatus === filtros.status)
    : rows;

  const resumo = {
    total: rows.length,
    aprovado: rows.filter(r => r.auditoriaStatus === 'aprovado').length,
    revisar: rows.filter(r => r.auditoriaStatus === 'revisar').length,
    semAuditoria: rows.filter(r => r.auditoriaStatus === 'sem_auditoria').length,
  };

  return { ok: true, rows: filtered, resumo };
}

/**
 * Retorna detalhe completo de uma auditoria — avaliação primária + auditoria
 * lado a lado pra review manual da Vertho.
 */
/**
 * Vertho aprova ou ajusta a avaliação da sem 14 após revisão manual.
 * - 'aprovar': marca status_revisao='aprovado_vertho', mantém notas.
 * - 'ajustar': aceita notas ajustadas por descritor, recalcula médias,
 *   marca status_revisao='ajustado_vertho'.
 */
export async function revisarAvaliacaoSem14(email, progressoId, { acao, ajustes }) {
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return { error: 'Acesso restrito à Vertho' };

  const sb = createSupabaseAdmin();
  const { data: prog } = await sb.from('temporada_semana_progresso')
    .select('id, trilha_id, feedback').eq('id', progressoId).maybeSingle();
  if (!prog) return { error: 'Registro não encontrado' };

  const fb = prog.feedback || {};

  if (acao === 'aprovar') {
    fb.status_revisao = 'aprovado_vertho';
    fb.revisado_em = new Date().toISOString();
    fb.revisado_por = email;
  } else if (acao === 'ajustar' && Array.isArray(ajustes)) {
    const avalDescs = fb.avaliacao_por_descritor || [];
    for (const aj of ajustes) {
      const desc = avalDescs.find(d => d.descritor === aj.descritor);
      if (desc && aj.nota_pos != null) {
        desc.nota_pos_original = desc.nota_pos;
        desc.nota_pos = Number(aj.nota_pos);
        desc.delta = Number(aj.nota_pos) - Number(desc.nota_pre);
        desc.classificacao = desc.delta >= 0.2 ? 'evoluiu' : desc.delta <= -0.2 ? 'regrediu' : 'manteve';
        desc.ajustado_por_vertho = true;
        desc.motivo_ajuste = aj.motivo || 'ajuste manual Vertho';
      }
    }
    fb.avaliacao_por_descritor = avalDescs;
    const notas = avalDescs.map(d => Number(d.nota_pos)).filter(n => !isNaN(n));
    if (notas.length) {
      fb.nota_media_pos = (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2);
      const pres = avalDescs.map(d => Number(d.nota_pre)).filter(n => !isNaN(n));
      fb.nota_media_pre = pres.length ? (pres.reduce((a, b) => a + b, 0) / pres.length).toFixed(2) : fb.nota_media_pre;
      fb.delta_medio = (Number(fb.nota_media_pos) - Number(fb.nota_media_pre)).toFixed(2);
    }
    fb.status_revisao = 'ajustado_vertho';
    fb.revisado_em = new Date().toISOString();
    fb.revisado_por = email;
  } else {
    return { error: "acao deve ser 'aprovar' ou 'ajustar'" };
  }

  await sb.from('temporada_semana_progresso').update({ feedback: fb }).eq('id', prog.id);

  // Regenera Evolution Report com notas ajustadas
  if (acao === 'ajustar') {
    try {
      const { gerarEvolutionReport } = await import('@/actions/evolution-report');
      await gerarEvolutionReport(prog.trilha_id);
    } catch (e) { console.warn('[revisao] evolution report:', e.message); }
  }

  return { ok: true, acao, status_revisao: fb.status_revisao };
}

export async function loadAuditoriaSem14Detalhe(email, progressoId) {
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return { error: 'Acesso restrito à Vertho' };

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('temporada_semana_progresso')
    .select(`
      id, trilha_id, semana, concluido_em, feedback,
      colaboradores!inner(nome_completo, cargo, perfil_dominante),
      empresas!inner(nome),
      trilhas!inner(competencia_foco, descritores_selecionados)
    `)
    .eq('id', progressoId).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Registro não encontrado' };

  const fb = data.feedback || {};
  return {
    ok: true,
    detalhe: {
      colaborador: data.colaboradores?.nome_completo,
      cargo: data.colaboradores?.cargo,
      perfilDominante: data.colaboradores?.perfil_dominante,
      empresa: data.empresas?.nome,
      competencia: data.trilhas?.competencia_foco,
      concluidoEm: data.concluido_em,
      cenario: fb.cenario,
      resposta: fb.cenario_resposta,
      avaliacaoPrimaria: {
        avaliacao_por_descritor: fb.avaliacao_por_descritor,
        nota_media_pre: fb.nota_media_pre,
        nota_media_pos: fb.nota_media_pos,
        delta_medio: fb.delta_medio,
        resumo_avaliacao: fb.resumo_avaliacao,
        status_revisao: fb.status_revisao || null,
        revisado_em: fb.revisado_em || null,
        revisado_por: fb.revisado_por || null,
      },
      auditoria: fb.auditoria,
    },
  };
}
