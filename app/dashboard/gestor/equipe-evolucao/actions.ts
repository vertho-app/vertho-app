'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext, mesmoEmail } from '@/lib/authz';
import { escaparLike } from '@/lib/sql-like';
import { loadTemporadaConcluida } from '@/actions/temporada-concluida';

/**
 * Lista os liderados do gestor com temporada (em andamento ou concluída)
 * e seu status de evolução. Gestor vê os liderados DELE (`gestor_email`);
 * RH vê tudo da empresa.
 */
export async function listarEquipeEvolucao() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };
  const ctx = await getUserContext(email);
  if (!ctx?.colaborador) return { error: 'Não autenticado' };
  const isGestor = ctx.role === 'gestor';
  const isRH = ctx.role === 'rh' || ctx.isPlatformAdmin;
  const isTutor = ctx.role === 'tutor';
  if (!isGestor && !isRH && !isTutor) return { error: 'Acesso restrito a gestor/tutor/RH' };

  const sb = createSupabaseAdmin();
  const empresaId = ctx.colaborador.empresa_id;

  // Vínculo gestor→liderado é por colaboradores.gestor_email; vínculo tutor→
  // tutorado é por colaboradores.tutorados_ids[] (Onboarding, Fase 4).
  // Fail-closed: se tutor sem tutorados, retorna vazio.
  const meuId = ctx.colaborador.id;
  const meuEmail = ctx.colaborador.email?.toLowerCase().trim();
  const tutoradosIds: string[] = (ctx.colaborador as any)?.tutorados_ids || [];

  if (isTutor && tutoradosIds.length === 0) {
    return { ok: true, rows: [], resumo: { total: 0 }, escopo: 'tutor' };
  }

  let colabQ = sb.from('colaboradores')
    .select('id, nome_completo, cargo, email, area_depto, gestor_email')
    .eq('empresa_id', empresaId)
    .neq('id', meuId);
  if (isGestor && meuEmail) {
    // `escaparLike`: `_` e `%` são curinga no ILIKE, e e-mail com underscore
    // casava gente que não era a mesma pessoa — listagem mais larga que o gate.
    colabQ = colabQ.ilike('gestor_email', escaparLike(meuEmail));
  } else if (isTutor) {
    colabQ = colabQ.in('id', tutoradosIds);
  }
  let { data: colabs } = await colabQ;
  // Segunda trava, em CÓDIGO: o banco filtra por padrão, a igualdade decide.
  if (isGestor && meuEmail) colabs = (colabs || []).filter((c: any) => mesmoEmail(c.gestor_email, meuEmail));
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
  const isTutor = ctx.role === 'tutor';
  if (!isGestor && !isRH && !isTutor) return { error: 'Acesso restrito' };

  const sb = createSupabaseAdmin();
  const empresaId = ctx.colaborador.empresa_id;
  const tutoradosIds: string[] = (ctx.colaborador as any)?.tutorados_ids || [];

  if (isTutor && tutoradosIds.length === 0) return { ok: true, rows: [] };

  // ⚠️ Esta listagem usava `area_depto` — a régua ERRADA e, pior, com fail-OPEN:
  // `if (isGestor && ctx.colaborador.area_depto)` significa que campo vazio =
  // SEM FILTRO, e 155 dos 161 gestores de Macaé têm `area_depto` nulo. Cada um
  // deles abria esta tela e recebia os checkpoints de TODAS as trilhas do tenant.
  // (F5 da auditoria. O par certo estava três linhas acima, no ramo do tutor,
  // que já era fail-closed.) Agora é `gestor_email`, a mesma régua da listagem
  // irmã deste arquivo e de `canViewColabJourney` — as três divergiam entre si.
  const meuEmailCp = ctx.colaborador.email?.toLowerCase().trim();
  let colabQ = sb.from('colaboradores').select('id, nome_completo, area_depto, gestor_email').eq('empresa_id', empresaId);
  if (isGestor) {
    if (!meuEmailCp) return { ok: true, rows: [] };   // fail-CLOSED
    colabQ = colabQ.ilike('gestor_email', escaparLike(meuEmailCp));
  } else if (isTutor) colabQ = colabQ.in('id', tutoradosIds);
  let { data: colabs } = await colabQ;
  if (isGestor) colabs = (colabs || []).filter((c: any) => mesmoEmail(c.gestor_email, meuEmailCp));
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

  // ── Posse ────────────────────────────────────────────────────────────────
  // Até 10/08/2026 o gate acima era só de PAPEL: qualquer gestor/RH de QUALQUER
  // tenant passava, o `trilhaId` vinha do cliente, e o payload carimbava
  // `empresa_id: trilha.empresa_id` — ou seja, o tenant do registro vinha do
  // próprio pedido. O DELETE apagava o checkpoint do tenant alheio e o INSERT
  // gravava lá uma avaliação assinada com o `gestor_id` de quem chamou.
  // Passava por três guards: o `ownership-guard` não enxerga este idioma de
  // gate, o `dashboard-isolation` só proíbe os nomes email/colaboradorId/
  // empresaId, e o `tenant-mutation-guard` não cobre `checkpoints_gestor`.
  //
  // Mesma mensagem de "não encontrada" para trilha inexistente e trilha de
  // outro tenant: distinguir as duas transforma o endpoint num verificador de
  // existência de uuid alheio.
  if (!ctx.isPlatformAdmin && trilha.empresa_id !== ctx.colaborador.empresa_id) {
    return { error: 'Trilha não encontrada' };
  }

  // Escopo DENTRO do tenant: a MESMA régua da listagem que leva até aqui e de
  // `canViewColabJourney` — `gestor_email`. Era `area_depto` quando esta função
  // foi corrigida (F6), porque era o que a listagem usava; F4 unificou as três.
  if (ctx.role === 'gestor') {
    const { data: alvo } = await sb.from('colaboradores')
      .select('id, gestor_email, empresa_id')
      .eq('id', trilha.colaborador_id)
      .eq('empresa_id', trilha.empresa_id)
      .maybeSingle();
    if (!alvo || !mesmoEmail(alvo.gestor_email, ctx.colaborador.email)) {
      return { error: 'Colaborador fora do seu escopo' };
    }
  }

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

  // `upsert` na constraint UNIQUE (trilha_id, semana) — o delete+insert anterior
  // não era atômico: insert falhando depois do delete perdia a avaliação que já
  // estava lá, e o `await` do delete nem checava `error`.
  const { error } = await sb.from('checkpoints_gestor')
    .upsert(payload, { onConflict: 'trilha_id,semana' });
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
  const isTutor = ctx.role === 'tutor';
  if (!isGestor && !isRH && !isTutor) return { error: 'Acesso restrito' };

  // Valida que o liderado é realmente do gestor/tutor/empresa
  const sb = createSupabaseAdmin();
  const { data: liderado } = await sb.from('colaboradores')
    .select('id, empresa_id, area_depto').eq('email', colabEmail).maybeSingle();
  if (!liderado) return { error: 'Colab não encontrado' };
  if (liderado.empresa_id !== ctx.colaborador.empresa_id) return { error: 'Colab de outra empresa' };
  if (isGestor && liderado.area_depto !== ctx.colaborador.area_depto) {
    return { error: 'Colab de outra área — só RH pode ver' };
  }
  if (isTutor) {
    const tutoradosIds: string[] = (ctx.colaborador as any)?.tutorados_ids || [];
    if (!tutoradosIds.includes(liderado.id)) {
      return { error: 'Colab fora do seu escopo de tutor' };
    }
  }

  return loadTemporadaConcluida(colabEmail);
}
