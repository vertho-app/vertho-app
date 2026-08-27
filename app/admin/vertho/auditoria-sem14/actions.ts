'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { resolverConfigDaTrilha } from '@/lib/season-engine/trilha-runtime';
import { enriquecerComRegua, sobreporNotaFresh } from '@/lib/season-engine/regua';
import { agregarEvidenciasAteAcumulada, normalizarAcumuladoPrimaria } from '@/lib/season-engine/evidencias-fechamento';
import { pontuarFechamento } from '@/lib/season-engine/fechamento-scorer';
import { maskColaborador, maskTextPII, unmaskPII } from '@/lib/pii-masker';

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
 */
export async function regerarScoringComFeedback(progressoId) {
  await requireAdminAction('ai.audit.regenerate');

  const sb = await requireAdminSupabase();
  const { data: prog } = await sb.from('temporada_semana_progresso')
    .select('id, trilha_id, empresa_id, colaborador_id, feedback')
    .eq('id', progressoId).maybeSingle();
  if (!prog) return { error: 'Registro não encontrado' };

  const fb = prog.feedback || {};
  const auditoriaAnterior = fb.auditoria;
  if (!auditoriaAnterior) return { error: 'Sem auditoria anterior pra usar como feedback' };

  const { data: trilha } = await sb.from('trilhas')
    .select('id, empresa_id, colaborador_id, competencia_foco, competencias_foco, descritores_selecionados, programa_modo, programa_config')
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
    sb, trilha.id, descritoresComRegua, programaConfig.semanaAcumulada,
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

  // Regenera Evolution Report
  try {
    const { gerarEvolutionReport } = await import('@/actions/evolution-report');
    await gerarEvolutionReport(prog.trilha_id);
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
