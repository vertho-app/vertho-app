'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { resolverConfigDaTrilha } from '@/lib/season-engine/trilha-runtime';
import { enriquecerComRegua, sobreporNotaFresh } from '@/lib/season-engine/regua';
import { agregarEvidenciasAteAcumulada, normalizarAcumuladoPrimaria } from '@/lib/season-engine/evidencias-fechamento';
import { pontuarFechamento } from '@/lib/season-engine/fechamento-scorer';
import { maskColaborador, maskTextPII, unmaskPII } from '@/lib/pii-masker';
import { tasks } from '@trigger.dev/sdk';
import { regionOpts } from '@/lib/trigger-region';
import type { reavaliarLoteSem14Task } from '@/trigger/reavaliar-lote-sem14';
import { REAVALIACAO_LOTE_CAP } from './constants';

/**
 * Lista auditorias da semana 14 de todas as empresas.
 * Só platform admin Vertho acessa.
 *
 * @param {string} email do usuário autenticado
 * @param {Object} filtros { status: 'todos'|'aprovado'|'revisar', empresaId?, limit? }
 */
export async function listarAuditoriasSem14(filtros: any = {}) {
  await requireAdminAction();

  const sb = await requireAdminSupabase();
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
  const rows = (data || []).map((r: any) => {
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
 * Regera o scoring da sem 14 injetando o feedback da auditoria anterior
 * no prompt do scorer — a IA corrige com base nos alertas.
 * Depois roda check de novo.
 *
 * Auth: passar `internal={ empresaId }` pula o gate de admin — usado pela task
 * Trigger.dev do lote (sem sessão). `empresaId` null (platform admin Vertho)
 * pula o assert de tenant (lote inter-tenant); setado rejeita trilha de outro
 * tenant. Mesmo padrão B5 de gerarEvolutionReport/gerarAvaliacaoAcumulada.
 * Sem `internal` → gate de admin (caller do modal).
 */
export async function regerarScoringComFeedback(progressoId, internal?: { empresaId: string | null }) {
  if (!internal) await requireAdminAction('ai.audit.regenerate');

  const sb = internal ? createSupabaseAdmin() : await requireAdminSupabase();
  const { data: prog } = await sb.from('temporada_semana_progresso')
    .select('id, trilha_id, empresa_id, colaborador_id, feedback')
    .eq('id', progressoId).maybeSingle();
  if (!prog) return { error: 'Registro não encontrado' };

  // B5: caller interno (service-role) prova o tenant; rejeita trilha de outro
  // tenant (trilhaId forjado). empresaId null = platform admin → pula.
  if (internal && internal.empresaId && prog.empresa_id !== internal.empresaId) {
    return { error: 'Registro de outro tenant — acesso negado' };
  }

  const fb = prog.feedback || {};
  const auditoriaAnterior = fb.auditoria;
  if (!auditoriaAnterior) return { error: 'Sem auditoria anterior pra usar como feedback' };

  const { data: trilha } = await sb.from('trilhas')
    .select('id, empresa_id, colaborador_id, competencia_foco, competencias_foco, descritores_selecionados, programa_modo')
    .eq('id', prog.trilha_id).maybeSingle();
  if (!trilha) return { error: 'Trilha não encontrada' };

  const { data: colab } = await sb.from('colaboradores')
    .select('nome_completo, cargo, perfil_dominante').eq('id', trilha.colaborador_id).maybeSingle();

  const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
  if (!descritores.length) return { error: 'Trilha sem descritores_selecionados' };

  // Config pela FONTE ÚNICA (carimbo da trilha) — a regeneração passa a usar
  // as semanas certas do modo (antes: 13 HARDCODED, quebraria piloto/onboarding)
  // e a herdar trava/spec_version/notaPrograma do núcleo no piloto.
  const programaConfig = await resolverConfigDaTrilha(sb, trilha);
  const isPiloto = programaConfig.modo === 'piloto';
  const competenciasLabel = Array.isArray(trilha.competencias_foco) && trilha.competencias_foco.length > 1
    ? trilha.competencias_foco.join(' + ')
    : trilha.competencia_foco;

  // Régua + nota fresh pela fonte única (mata a 4ª cópia local da régua)
  const enriquecidos = await enriquecerComRegua({
    db: sb, sbGlobal: sb, empresaId: trilha.empresa_id,
    competencia: trilha.competencia_foco, descritores,
  });
  const descritoresComRegua = await sobreporNotaFresh(sb, trilha.colaborador_id, trilha.competencia_foco, enriquecidos);

  // Acumulado + evidências nas semanas da CONFIG (não mais 13 fixo)
  const { data: progAcum } = await sb.from('temporada_semana_progresso')
    .select('feedback').eq('trilha_id', trilha.id).eq('semana', programaConfig.semanaAcumulada).maybeSingle();
  const acumuladoPrimaria = normalizarAcumuladoPrimaria(progAcum?.feedback?.acumulado);
  const evidenciasAcumuladas = await agregarEvidenciasAteAcumulada(
    sb, trilha.id, descritoresComRegua, programaConfig.semanaAcumulada, isPiloto,
  );

  // Feedback da auditoria anterior como instrução extra (2ª rodada)
  const alertasTexto = (auditoriaAnterior.alertas || []).map((a: any) =>
    typeof a === 'string' ? `- ${a}` : `- [${a.descritor || a.tipo || ''}] ${a.descricao || a.detalhe || ''}`
  ).join('\n') || '(nenhum)';
  const ajustesTexto = (auditoriaAnterior.ajustes_sugeridos || []).map((a: any) =>
    `- [${a.descritor}]: nota sugerida ${a.nota_pos_sugerida} — ${a.motivo}`
  ).join('\n') || '(nenhum)';
  const feedbackAuditoria = `Nota da auditoria: ${auditoriaAnterior.nota_auditoria}/100
Status: ${auditoriaAnterior.status || 'revisar'}
Resumo: ${auditoriaAnterior.resumo_auditoria || '(sem resumo)'}
${auditoriaAnterior.ponto_mais_confiavel ? `Ponto mais confiável: ${auditoriaAnterior.ponto_mais_confiavel}` : ''}
${auditoriaAnterior.ponto_mais_fragil ? `Ponto mais frágil: ${auditoriaAnterior.ponto_mais_fragil}` : ''}
Alertas:
${alertasTexto}
Ajustes sugeridos:
${ajustesTexto}`;

  // PII masking — a regeneração agora segue a MESMA política do fluxo normal
  // (antes mandava nome/resposta crus pra IA externa).
  const { masked: colabMasked, map: piiMap } = maskColaborador(colab);
  const respostaMasked = maskTextPII(fb.cenario_resposta || '', piiMap);
  const evidenciasMasked = maskTextPII(evidenciasAcumuladas, piiMap);

  // Núcleo compartilhado com a rota /evaluation — scorer + trava + check
  const resultado = await pontuarFechamento({
    competencia: competenciasLabel,
    descritores: descritoresComRegua,
    cenario: fb.cenario,
    resposta: respostaMasked,
    nomeColab: colabMasked.nome,
    perfilDominante: colab?.perfil_dominante,
    evidenciasAcumuladas: evidenciasMasked,
    acumuladoPrimaria,
    config: programaConfig,
    regeracao: { feedbackAuditoria },
    // Regeneração respeita a arguição já feita (fb.arguicao) — mesma modulação.
    evidenciasArguicao: fb.arguicao?.concluida ? fb.arguicao.extracao : null,
  });
  if (resultado.ok !== true) return { error: `Scorer falhou: ${resultado.erro}`, meta: resultado.meta };

  const { parsed, auditoria } = resultado;

  // Despersonaliza os campos textuais
  if (parsed?.resumo_avaliacao?.mensagem_geral) parsed.resumo_avaliacao.mensagem_geral = unmaskPII(parsed.resumo_avaliacao.mensagem_geral, piiMap);
  if (Array.isArray(parsed?.avaliacao_por_descritor)) {
    parsed.avaliacao_por_descritor = parsed.avaliacao_por_descritor.map((d: any) => ({
      ...d, justificativa: unmaskPII(d.justificativa, piiMap),
    }));
  }
  if (auditoria?.resumo_auditoria) auditoria.resumo_auditoria = unmaskPII(auditoria.resumo_auditoria, piiMap);

  // Salva (regeneracao_meta = metadados operacionais pro admin/debug)
  const novoFb = {
    ...fb, ...parsed,
    auditoria,
    auditoria_anterior: auditoriaAnterior,
    regerado_com_feedback: true,
    regerado_em: new Date().toISOString(),
    regeneracao_meta: resultado.meta,
  };
  await sb.from('temporada_semana_progresso').update({ feedback: novoFb }).eq('id', prog.id).eq('empresa_id', prog.empresa_id);

  // Regenera Evolution Report — repassa `internal` (sem isso, no worker Trigger
  // cairia no gate de admin → FORBIDDEN silencioso, mesmo bug do piloto pré-B5).
  try {
    const { gerarEvolutionReport } = await import('@/actions/evolution-report');
    await gerarEvolutionReport(prog.trilha_id, internal);
  } catch (e) { console.warn('[regerar ER]', e.message); }

  return { ok: true, novaNota: auditoria?.nota_auditoria, novoStatus: auditoria?.status, meta: resultado.meta };
}

export async function loadAuditoriaSem14Detalhe(progressoId) {
  await requireAdminAction();

  const sb = await requireAdminSupabase();
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
  const d: any = data;

  // Busca progresso da sem 13 pra acumulada
  const { data: fb13 } = await sb.from('temporada_semana_progresso')
    .select('feedback').eq('trilha_id', d.trilha_id).eq('semana', 13).maybeSingle();

  const fb = d.feedback || {};
  return {
    ok: true,
    detalhe: {
      colaborador: d.colaboradores?.nome_completo,
      cargo: d.colaboradores?.cargo,
      perfilDominante: d.colaboradores?.perfil_dominante,
      empresa: d.empresas?.nome,
      competencia: d.trilhas?.competencia_foco,
      concluidoEm: d.concluido_em,
      cenario: fb.cenario,
      resposta: fb.cenario_resposta,
      avaliacaoPrimaria: {
        avaliacao_por_descritor: fb.avaliacao_por_descritor,
        nota_media_pre: fb.nota_media_pre,
        nota_media_cenario: fb.nota_media_cenario || null,
        nota_media_pos: fb.nota_media_pos,
        delta_medio: fb.delta_medio,
        resumo_avaliacao: fb.resumo_avaliacao,
      },
      acumulada: (() => {
        try {
          const a = (fb13 as any)?.feedback?.acumulado?.primaria?.avaliacao_acumulada || [];
          return a.map((x: any) => ({ descritor: x.descritor, nota_acumulada: x.nota_acumulada }));
        } catch { return []; }
      })(),
      auditoria: fb.auditoria,
    },
  };
}

/**
 * Inicia um lote de reavaliação da Sem 14 em background (Trigger.dev).
 * Cria a row de rastreio (status='processing') e dispara a task.
 *
 * @param progressoIds ids de temporada_semana_progresso (Sem 14) — todos devem
 *                     ter auditoria anterior (senão regerarScoringComFeedback rejeita).
 * @param empresaId    tenant do caller (null = platform admin Vertho, lote inter-tenant).
 */
export async function iniciarReavaliacaoLote(progressoIds: string[], empresaId: string | null = null) {
  await requireAdminAction('ai.audit.regenerate');

  if (!Array.isArray(progressoIds) || progressoIds.length === 0) {
    return { error: 'Selecione ao menos uma avaliação.' };
  }
  if (progressoIds.length > REAVALIACAO_LOTE_CAP) {
    return { error: `Lote de até ${REAVALIACAO_LOTE_CAP} avaliações por vez (divida em lotes menores).` };
  }

  const sb = await requireAdminSupabase();

  // Valida que todos têm auditoria anterior (regerar exige) — 1 query batch.
  const { data: progs, error: eProgs } = await sb.from('temporada_semana_progresso')
    .select('id, feedback->auditoria, empresa_id')
    .in('id', progressoIds);
  if (eProgs) return { error: eProgs.message };
  const semAuditoria = (progs || []).filter((p: any) => !p.auditoria);
  if (semAuditoria.length) {
    return { error: `${semAuditoria.length} avaliação(ões) selecionada(s) sem auditoria anterior — remova-as do lote.` };
  }
  // Tenant admin só pode regenerar itens da própria empresa.
  if (empresaId) {
    const fora = (progs || []).filter((p: any) => p.empresa_id !== empresaId);
    if (fora.length) return { error: 'Lote contém avaliações de outra empresa.' };
  }

  const { data: lote, error: eLote } = await sb.from('auditoria_reavaliacao_lote')
    .insert({
      progresso_ids: progressoIds,
      total: progressoIds.length,
      status: 'processing',
      empresa_id: empresaId,
    })
    .select('id').single();
  if (eLote) return { error: eLote.message };

  try {
    await tasks.trigger<typeof reavaliarLoteSem14Task>(
      'reavaliar-lote-sem14',
      { loteId: lote.id, progressoIds, empresaId },
      regionOpts(),
    );
  } catch (e: any) {
    // Task não deployada / Trigger indisponível → marca erro e sinaliza. Não há
    // fallback inline viável (N×~2-3min excede maxDuration de server action); o
    // caller mostra a mensagem e aponta pra regeneração individual pelo modal.
    await sb.from('auditoria_reavaliacao_lote')
      .update({ status: 'done', erros: [{ error: `Trigger indisponível: ${String(e?.message || e).slice(0, 300)}` }] })
      .eq('id', lote.id);
    return { error: 'Lote exige o worker Trigger.dev (task reavaliar-lote-sem14). Verifique o deploy ou regenere individualmente pelo modal de detalhe.' };
  }

  return { ok: true, loteId: lote.id };
}

/**
 * Status do lote pra polling do admin ver progresso ("Reavaliando X/Y") e
 * resultado ao final (ok/erros).
 */
export async function statusReavaliacaoLote(loteId: string) {
  await requireAdminAction();
  const sb = await requireAdminSupabase();
  const { data, error } = await sb.from('auditoria_reavaliacao_lote')
    .select('status, total, processados, erros')
    .eq('id', loteId).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Lote não encontrado' };
  return { ok: true, ...data };
}
