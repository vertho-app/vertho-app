'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext } from '@/lib/authz';
import { gerarAvaliacaoAcumulada } from '@/actions/avaliacao-acumulada';

export async function listarAvaliacoesAcumuladas(email, filtros = {}) {
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return { error: 'Acesso restrito à Vertho' };

  const sb = createSupabaseAdmin();
  const limit = filtros.limit || 50;

  let q = sb.from('temporada_semana_progresso')
    .select(`
      id, trilha_id, colaborador_id, empresa_id, concluido_em, feedback,
      colaboradores!inner(nome_completo, cargo),
      empresas!inner(nome),
      trilhas!inner(competencia_foco, numero_temporada)
    `)
    .eq('semana', 13)
    .not('feedback', 'is', null)
    .order('concluido_em', { ascending: false })
    .limit(limit);

  if (filtros.empresaId) q = q.eq('empresa_id', filtros.empresaId);

  const { data, error } = await q;
  if (error) return { error: error.message };

  const rows = (data || []).map(r => {
    const acum = r.feedback?.acumulado || null;
    return {
      id: r.id,
      trilhaId: r.trilha_id,
      colaborador: r.colaboradores?.nome_completo,
      cargo: r.colaboradores?.cargo,
      empresa: r.empresas?.nome,
      empresaId: r.empresa_id,
      competencia: r.trilhas?.competencia_foco,
      temporada: r.trilhas?.numero_temporada,
      concluidoEm: r.concluido_em,
      geradoEm: acum?.gerado_em || null,
      notaMedia: acum?.primaria?.nota_media_acumulada ?? null,
      auditoriaNota: acum?.auditoria?.nota_auditoria ?? null,
      auditoriaStatus: acum?.auditoria?.status || (acum ? 'sem_auditoria' : 'nao_gerado'),
      alertas: acum?.auditoria?.alertas || [],
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
    naoGerado: rows.filter(r => r.auditoriaStatus === 'nao_gerado').length,
  };

  return { ok: true, rows: filtered, resumo };
}

export async function loadAvaliacaoAcumuladaDetalhe(email, progressoId) {
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return { error: 'Acesso restrito à Vertho' };

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('temporada_semana_progresso')
    .select(`
      id, trilha_id, colaborador_id, concluido_em, feedback,
      colaboradores!inner(nome_completo, cargo, perfil_dominante),
      empresas!inner(nome),
      trilhas!inner(competencia_foco, descritores_selecionados)
    `)
    .eq('id', progressoId).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Registro não encontrado' };

  const acum = data.feedback?.acumulado;

  // Busca notas iniciais EXTERNAMENTE (não vindo da IA acumuladora, que é cega
  // pra iniciais por design). Usado só pra exibir comparação no painel Vertho.
  const descs = Array.isArray(data.trilhas?.descritores_selecionados) ? data.trilhas.descritores_selecionados : [];
  const { data: initialRows } = await sb.from('descriptor_assessments')
    .select('descritor, nota')
    .eq('colaborador_id', data.colaborador_id)
    .eq('competencia', data.trilhas?.competencia_foco)
    .in('descritor', descs.map(d => d.descritor));
  const notasIniciais = Object.fromEntries((initialRows || []).map(r => [r.descritor, Number(r.nota)]));
  // Fallback pra snapshot do JSONB se não achar no descriptor_assessments
  for (const d of descs) if (notasIniciais[d.descritor] == null) notasIniciais[d.descritor] = d.nota_atual;

  return {
    ok: true,
    detalhe: {
      trilhaId: data.trilha_id,
      colaborador: data.colaboradores?.nome_completo,
      cargo: data.colaboradores?.cargo,
      perfilDominante: data.colaboradores?.perfil_dominante,
      empresa: data.empresas?.nome,
      competencia: data.trilhas?.competencia_foco,
      concluidoEm: data.concluido_em,
      geradoEm: acum?.gerado_em || null,
      primaria: acum?.primaria || null,
      auditoria: acum?.auditoria || null,
      notasIniciais, // { descritor: nota_inicial } pra comparação visual no painel
    },
  };
}

/**
 * Permite Vertho regenerar manualmente a avaliação acumulada (caso tenha
 * havido ajuste de régua, novas evidências, etc).
 */
export async function regerarAvaliacaoAcumulada(email, trilhaId) {
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return { error: 'Acesso restrito à Vertho' };
  return gerarAvaliacaoAcumulada(trilhaId);
}
