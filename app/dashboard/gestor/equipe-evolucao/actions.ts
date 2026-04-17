'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext } from '@/lib/authz';
import { loadTemporadaConcluida } from '@/actions/temporada-concluida';

/**
 * Lista os liderados do gestor com temporada (em andamento ou concluída)
 * e seu status de evolução. Gestor vê só sua área; RH vê tudo da empresa.
 */
export async function listarEquipeEvolucao() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };
  const ctx = await getUserContext(email);
  if (!ctx?.colaborador) return { error: 'Não autenticado' };
  const isGestor = ctx.role === 'gestor';
  const isRH = ctx.role === 'rh' || ctx.isPlatformAdmin;
  if (!isGestor && !isRH) return { error: 'Acesso restrito a gestor/RH' };

  const sb = createSupabaseAdmin();
  const empresaId = ctx.colaborador.empresa_id;

  // Colabs: gestor vê sua área, RH vê empresa inteira
  let colabQ = sb.from('colaboradores')
    .select('id, nome_completo, cargo, email, area_depto')
    .eq('empresa_id', empresaId);
  if (isGestor && ctx.colaborador.area_depto) {
    colabQ = colabQ.eq('area_depto', ctx.colaborador.area_depto);
  }
  const { data: colabs } = await colabQ;
  if (!colabs?.length) return { ok: true, rows: [], resumo: { total: 0 } };

  // Trilhas desses colabs
  const { data: trilhas } = await sb.from('trilhas')
    .select('id, colaborador_id, competencia_foco, numero_temporada, status, evolution_report, criado_em')
    .in('colaborador_id', colabs.map(c => c.id))
    .order('criado_em', { ascending: false });
  const trilhaPorColab = {};
  for (const t of (trilhas || [])) {
    if (!trilhaPorColab[t.colaborador_id]) trilhaPorColab[t.colaborador_id] = t;
  }

  const rows = colabs.map(c => {
    const t = trilhaPorColab[c.id];
    const rep = t?.evolution_report || null;
    const resumo = rep?.resumo || {};
    const descritores = rep?.descritores || [];
    const mediaPos = rep?.nota_media_pos != null ? Number(rep.nota_media_pos) : null;
    const mediaPre = descritores.length
      ? descritores.reduce((a, d) => a + (d.nota_pre || 0), 0) / descritores.length
      : null;
    const delta = (mediaPos != null && mediaPre != null) ? mediaPos - mediaPre : null;

    // Classificação agregada
    let status = 'sem_trilha';
    if (!t) status = 'sem_trilha';
    else if (t.status === 'ativa' || t.status === 'pausada') status = 'em_andamento';
    else if (t.status === 'concluida') {
      const { confirmadas = 0, parciais = 0, regressoes = 0, estagnacoes = 0 } = resumo;
      if (regressoes > parciais + confirmadas) status = 'regressao';
      else if (confirmadas > parciais + estagnacoes) status = 'evolucao_confirmada';
      else if (confirmadas + parciais > estagnacoes) status = 'evolucao_parcial';
      else status = 'estagnacao';
    } else status = 'arquivada';

    return {
      colaboradorId: c.id,
      colabEmail: c.email,
      colab: c.nome_completo,
      cargo: c.cargo,
      competencia: t?.competencia_foco || null,
      temporada: t?.numero_temporada || null,
      statusTrilha: t?.status || null,
      status,
      mediaPre, mediaPos, delta,
      resumoDescritores: resumo,
    };
  });

  const resumo = {
    total: rows.length,
    emAndamento: rows.filter(r => r.status === 'em_andamento').length,
    evolucaoConfirmada: rows.filter(r => r.status === 'evolucao_confirmada').length,
    evolucaoParcial: rows.filter(r => r.status === 'evolucao_parcial').length,
    estagnacao: rows.filter(r => r.status === 'estagnacao').length,
    regressao: rows.filter(r => r.status === 'regressao').length,
    semTrilha: rows.filter(r => r.status === 'sem_trilha').length,
  };

  return { ok: true, rows, resumo };
}

/**
 * Lista checkpoints pendentes (sems 5 ou 10) da equipe do gestor.
 * Cria automaticamente quando a sem correspondente entra em andamento.
 */
export async function listarCheckpointsPendentes() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };
  const ctx = await getUserContext(email);
  if (!ctx?.colaborador) return { error: 'Não autenticado' };
  const isGestor = ctx.role === 'gestor';
  const isRH = ctx.role === 'rh' || ctx.isPlatformAdmin;
  if (!isGestor && !isRH) return { error: 'Acesso restrito' };

  const sb = createSupabaseAdmin();
  const empresaId = ctx.colaborador.empresa_id;

  let colabQ = sb.from('colaboradores').select('id, nome_completo, area_depto').eq('empresa_id', empresaId);
  if (isGestor && ctx.colaborador.area_depto) colabQ = colabQ.eq('area_depto', ctx.colaborador.area_depto);
  const { data: colabs } = await colabQ;
  if (!colabs?.length) return { ok: true, rows: [] };

  // Trilhas ativas desses colabs que passaram da sem 5 ou sem 10
  const { data: trilhas } = await sb.from('trilhas')
    .select('id, colaborador_id, competencia_foco, numero_temporada, status')
    .in('colaborador_id', colabs.map(c => c.id))
    .eq('status', 'ativa');
  if (!trilhas?.length) return { ok: true, rows: [] };

  // Pra cada trilha, olha progresso nas sems 5 e 10
  const { data: progs } = await sb.from('temporada_semana_progresso')
    .select('trilha_id, semana, status')
    .in('trilha_id', trilhas.map(t => t.id))
    .in('semana', [5, 10]);

  // E checkpoints existentes
  const { data: checkpoints } = await sb.from('checkpoints_gestor')
    .select('trilha_id, semana, status, avaliacao_gestor')
    .in('trilha_id', trilhas.map(t => t.id));
  const cpMap = {};
  (checkpoints || []).forEach(c => { cpMap[`${c.trilha_id}_${c.semana}`] = c; });

  const rows = [];
  for (const t of trilhas) {
    const colab = colabs.find(c => c.id === t.colaborador_id);
    for (const sem of [5, 10]) {
      const prog = (progs || []).find(p => p.trilha_id === t.id && p.semana === sem);
      if (!prog || prog.status === 'pendente') continue; // só sinaliza quando sem entrou
      const cp = cpMap[`${t.id}_${sem}`];
      if (cp?.status === 'validado') continue; // já foi
      rows.push({
        trilhaId: t.id,
        colabId: colab?.id,
        colab: colab?.nome_completo,
        competencia: t.competencia_foco,
        semana: sem,
        statusCheckpoint: cp?.status || 'pendente',
        avaliacaoGestor: cp?.avaliacao_gestor || null,
      });
    }
  }

  return { ok: true, rows };
}

/**
 * Gestor salva o checkpoint (sems 5 ou 10).
 */
export async function salvarCheckpointGestor({ trilhaId, semana, avaliacao, observacao }) {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };
  const ctx = await getUserContext(email);
  if (!ctx?.colaborador) return { error: 'Não autenticado' };
  if (ctx.role !== 'gestor' && ctx.role !== 'rh' && !ctx.isPlatformAdmin) return { error: 'Acesso restrito' };
  if (![5, 10].includes(Number(semana))) return { error: 'Semana inválida (só 5 ou 10)' };
  if (!['evoluindo', 'estagnado', 'regredindo'].includes(avaliacao)) return { error: 'Avaliação inválida' };

  const sb = createSupabaseAdmin();
  const { data: trilha } = await sb.from('trilhas')
    .select('id, empresa_id, colaborador_id').eq('id', trilhaId).maybeSingle();
  if (!trilha) return { error: 'Trilha não encontrada' };

  const payload = {
    trilha_id: trilhaId,
    empresa_id: trilha.empresa_id,
    colaborador_id: trilha.colaborador_id,
    gestor_id: ctx.colaborador.id,
    semana: Number(semana),
    status: avaliacao === 'evoluindo' ? 'validado' : 'alerta',
    avaliacao_gestor: avaliacao,
    observacao: observacao || null,
    validado_em: new Date().toISOString(),
  };

  // Upsert via delete+insert (chave única trilha_id+semana)
  await sb.from('checkpoints_gestor').delete().eq('trilha_id', trilhaId).eq('semana', Number(semana));
  const { error } = await sb.from('checkpoints_gestor').insert(payload);
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Gestor/RH pode ver detalhe de um liderado (reusa loadTemporadaConcluida
 * passando o email do colab liderado, mas valida autorização).
 */
export async function loadLideradoConcluida(colabEmail) {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };
  const ctx = await getUserContext(email);
  if (!ctx?.colaborador) return { error: 'Não autenticado' };
  const isGestor = ctx.role === 'gestor';
  const isRH = ctx.role === 'rh' || ctx.isPlatformAdmin;
  if (!isGestor && !isRH) return { error: 'Acesso restrito' };

  // Valida que o liderado é realmente do gestor/empresa
  const sb = createSupabaseAdmin();
  const { data: liderado } = await sb.from('colaboradores')
    .select('empresa_id, area_depto').eq('email', colabEmail).maybeSingle();
  if (!liderado) return { error: 'Colab não encontrado' };
  if (liderado.empresa_id !== ctx.colaborador.empresa_id) return { error: 'Colab de outra empresa' };
  if (isGestor && liderado.area_depto !== ctx.colaborador.area_depto) {
    return { error: 'Colab de outra área — só RH pode ver' };
  }

  return loadTemporadaConcluida(colabEmail);
}
