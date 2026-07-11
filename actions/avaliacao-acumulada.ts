'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { callAI } from './ai-client';
import { promptAvaliacaoAcumulada, promptAvaliacaoAcumuladaCheck, validateAvaliacaoAcumulada, validateAvaliacaoAcumuladaCheck } from '@/lib/season-engine/prompts/acumulado';
import { maskColaborador, maskTextPII, unmaskPII } from '@/lib/pii-masker';
import { requireAdminAction } from '@/lib/auth/action-context';
import { resolverConfigDaTrilha } from '@/lib/season-engine/trilha-runtime';
import { parseJsonIA } from '@/lib/ai-json';
import { enriquecerComRegua, sobreporNotaFresh } from '@/lib/season-engine/regua';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { getModelForTask } from '@/lib/ai-tasks';
import { PROGRESSO } from '@/lib/status';

/**
 * Gera avaliação acumulada da temporada (1ª IA) + check por 2ª IA e
 * persiste em temporada_semana_progresso (semana=programaConfig.semanaAcumulada).feedback.acumulado.
 *
 * Trigger: chamada no fim da semana de acumulada (regular=13) e no fim da
 * sem 2 do piloto. Também pode ser chamada manualmente pelo admin Vertho.
 *
 * Auth: passar `internal={ empresaId }` (tenant da SESSÃO do caller) pula o gate
 * de admin — usado pelos AUTO-TRIGGERS das rotas (a sessão é do PRÓPRIO COLAB;
 * sem isso o trigger morria em FORBIDDEN silencioso). A função revalida que a
 * trilha pertence a esse tenant (B5 — defense-in-depth). Sem `internal` → gate
 * de admin. Path restrito a callers no servidor.
 */
export async function gerarAvaliacaoAcumulada(trilhaId: string, internal?: { empresaId: string | null }) {
  // Descobre tenant via trilha (raw — query inicial sem tenant conhecido).
  const sbRaw = internal ? createSupabaseAdmin() : await requireAdminSupabase('ai.audit.regenerate');
  const { data: trilha } = await sbRaw.from('trilhas')
    .select('id, empresa_id, colaborador_id, competencia_foco, competencias_foco, descritores_selecionados, temporada_plano, programa_modo')
    .eq('id', trilhaId).maybeSingle();
  if (!trilha) return { error: 'trilha não encontrada' };

  // B5: caller interno (service-role) DEVE provar o tenant; rejeita trilha de
  // outro tenant (trilhaId forjado) — defense-in-depth contra escalonamento.
  if (internal && internal.empresaId && trilha.empresa_id !== internal.empresaId) {
    return { error: 'trilha de outro tenant — acesso negado' };
  }

  const tdb = tenantDb(trilha.empresa_id);

  // Semana da acumulada + nível-meta vêm do CARIMBO da trilha (mig 154);
  // legado sem carimbo → sys_config da empresa (comportamento antigo).
  const programaConfig = await resolverConfigDaTrilha(sbRaw, trilha);
  const semanaAcumulada = programaConfig.semanaAcumulada;
  const nivelMetaAlvo = programaConfig.nivelMetaAlvo;

  const { data: colab } = await tdb.from('colaboradores')
    .select('nome_completo, cargo').eq('id', trilha.colaborador_id).maybeSingle();

  const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
  if (!descritores.length) return { error: 'sem descritores_selecionados' };

  // Competências da trilha: array (DUO/onboarding/single novo) com fallback
  // pro singular legado. >1 → avalia POR competência (régua correta por comp).
  const compsTrilha: string[] = Array.isArray(trilha.competencias_foco) && trilha.competencias_foco.length > 0
    ? trilha.competencias_foco
    : [trilha.competencia_foco];
  const isMultiComp = compsTrilha.length > 1;

  let payload: any;
  let primariaRet: any = null;
  let auditoriaRet: any = null;

  // Piloto: as semanas de conteúdo têm 2 descritores (conteudos_dia) — a
  // evidência da reflexão vale pros DOIS (descritores_cobertos). Nos demais
  // modos o flag fica false e o mapeamento por `descritor` segue byte-igual.
  const evidenciaPorCobertos = programaConfig.modo === 'piloto';

  if (!isMultiComp) {
    // ── Single-comp (Regular legado / regular_single / piloto): shape inalterado ──
    const r = await avaliarCompAcumulada(
      tdb, sbRaw, trilha, colab, trilha.competencia_foco, descritores, semanaAcumulada, nivelMetaAlvo, evidenciaPorCobertos,
    );
    if (r.error) return { error: r.error };
    primariaRet = r.primaria;
    auditoriaRet = r.auditoria;
    payload = { gerado_em: new Date().toISOString(), primaria: r.primaria, auditoria: r.auditoria };
  } else {
    // ── Multi-comp (Regular DUO): loop por competência ──
    const porCompetencia: any[] = [];
    for (const comp of compsTrilha) {
      const descsComp = descritores.filter((d: any) => d.competencia === comp);
      if (!descsComp.length) {
        porCompetencia.push({ competencia: comp, error: 'sem descritores desta competência' });
        continue;
      }
      const r = await avaliarCompAcumulada(
        tdb, sbRaw, trilha, colab, comp, descsComp, semanaAcumulada, nivelMetaAlvo,
      );
      porCompetencia.push(r.error
        ? { competencia: comp, error: r.error }
        : { competencia: comp, primaria: r.primaria, auditoria: r.auditoria });
    }
    if (porCompetencia.every(p => p.error)) {
      return { error: 'Falha na avaliação acumulada de todas as competências' };
    }
    payload = {
      gerado_em: new Date().toISOString(),
      multi: true,
      competencias: compsTrilha,
      por_competencia: porCompetencia,
    };
  }

  const { data: progSemAcumulada } = await tdb.from('temporada_semana_progresso')
    .select('id, feedback').eq('trilha_id', trilhaId).eq('semana', semanaAcumulada).maybeSingle();

  if (progSemAcumulada) {
    const novoFb = { ...(progSemAcumulada.feedback || {}), acumulado: payload };
    await tdb.from('temporada_semana_progresso').update({ feedback: novoFb }).eq('id', progSemAcumulada.id);
  } else {
    // empresa_id é injetado pelo tdb.insert
    await tdb.from('temporada_semana_progresso').insert({
      trilha_id: trilhaId,
      colaborador_id: trilha.colaborador_id,
      semana: semanaAcumulada, tipo: 'avaliacao', status: PROGRESSO.EM_ANDAMENTO,
      feedback: { acumulado: payload },
    });
  }

  if (payload.multi) return { ok: true, multi: true, por_competencia: payload.por_competencia };
  return { ok: true, primaria: primariaRet, auditoria: auditoriaRet };
}

/**
 * Avalia UMA competência (1ª IA + check 2ª IA) sobre seu subconjunto de
 * descritores. Núcleo compartilhado entre a acumulada single e a por-comp
 * (DUO) — fonte única, sem drift entre os caminhos.
 */
async function avaliarCompAcumulada(
  tdb: any, sbRaw: any, trilha: any, colab: any,
  competencia: string, descritores: any[], semanaAcumulada: number, nivelMetaAlvo: 2 | 3,
  evidenciaPorCobertos: boolean = false,
): Promise<{ primaria?: any; auditoria?: any; error?: string }> {
  // Enriquece com régua + nota_atual fresh (por competência → régua correta)
  const descritoresComRegua = await enriquecerComRegua({ db: tdb, sbGlobal: sbRaw, competencia, descritores });
  const descritoresFresh = await sobreporNotaFresh(tdb, trilha.colaborador_id, competencia, descritoresComRegua);

  // Agrega evidências até a semana de acumulada (regular=13)
  const evidenciasAcumuladas = await agregarEvidencias(tdb, trilha.id, descritoresFresh, trilha.temporada_plano, semanaAcumulada, evidenciaPorCobertos);

  // PII masking pro prompt externo (Claude).
  const { masked: colabMasked, map: piiMap } = maskColaborador(colab);
  const evidenciasMasked = maskTextPII(evidenciasAcumuladas, piiMap);

  // 1ª IA — avaliação primária
  let primaria = null;
  try {
    const { system, user } = promptAvaliacaoAcumulada({
      competencia,
      descritores: descritoresFresh,
      evidenciasAcumuladas: evidenciasMasked,
      nomeColab: colabMasked.nome,
      nivelMetaAlvo,
    });
    const r = await callAI(system, user, {}, 8000);
    primaria = validateAvaliacaoAcumulada(parseJsonIA(r));
    if (primaria?.resumo_geral) primaria.resumo_geral = unmaskPII(primaria.resumo_geral, piiMap);
    if (Array.isArray(primaria?.avaliacao_acumulada)) {
      primaria.avaliacao_acumulada = primaria.avaliacao_acumulada.map((d: any) => ({
        ...d, justificativa: unmaskPII(d.justificativa, piiMap),
      }));
    }
  } catch (err: any) {
    console.error(`[acumulado primária ${competencia}]`, err);
    return { error: 'Falha na 1ª IA: ' + err.message };
  }

  // 2ª IA — check (mask também na primária que vai pro prompt)
  let auditoria = null;
  try {
    const primariaMask = JSON.parse(maskTextPII(JSON.stringify(primaria), piiMap));
    const { system, user } = promptAvaliacaoAcumuladaCheck({
      competencia,
      descritores: descritoresFresh,
      evidenciasAcumuladas: evidenciasMasked,
      avaliacaoPrimaria: primariaMask,
    });
    // 2ª IA (auditor) configurável — default GPT 5.6 Luna (cross-família, barato).
    const checkModel = await getModelForTask(trilha.empresa_id, 'acumulada_check');
    const r = await callAI(system, user, { model: checkModel }, 6000);
    auditoria = validateAvaliacaoAcumuladaCheck(parseJsonIA(r));
    if (auditoria?.resumo_auditoria) auditoria.resumo_auditoria = unmaskPII(auditoria.resumo_auditoria, piiMap);
  } catch (err) {
    console.error(`[acumulado check ${competencia}]`, err);
    // Não falha — retorna primária sem auditoria
  }

  return { primaria, auditoria };
}

/**
 * Acumulada PARCIAL — usada no Modo Onboarding após cada missão integradora
 * (sems 4/7/9). Filtra `descritores_selecionados` pelas `competencias` passadas,
 * roda a 1ª/2ª IA só nesse subset e persiste em `progresso.semana === semFim`.
 *
 * Comportamento: idêntico à acumulada completa, mas com escopo reduzido. Não
 * dispara em modo regular.
 *
 * Auth: requer admin OU sistema interno (auto-trigger ao concluir missão na
 * route /api/temporada/reflection). Quando chamada pelo trigger, NÃO há admin —
 * o usuário é o próprio colab que terminou a missão. Por isso `internal=true`
 * pula `requireAdminAction`. Esse path é restrito a callers no servidor.
 */
export async function gerarAvaliacaoAcumuladaParcial(trilhaId: string, competenciasFiltro: string[], semFim: number, internal?: { empresaId: string | null }) {
  if (!internal) await requireAdminAction('ai.audit.regenerate');
  if (!Array.isArray(competenciasFiltro) || competenciasFiltro.length === 0) {
    return { error: 'competenciasFiltro obrigatório' };
  }
  const sbRaw = createSupabaseAdmin();
  const { data: trilha } = await sbRaw.from('trilhas')
    .select('id, empresa_id, colaborador_id, competencia_foco, descritores_selecionados, temporada_plano, programa_modo')
    .eq('id', trilhaId).maybeSingle();
  if (!trilha) return { error: 'trilha não encontrada' };
  // B5: caller interno prova o tenant; rejeita trilha de outro tenant.
  if (internal && internal.empresaId && trilha.empresa_id !== internal.empresaId) {
    return { error: 'trilha de outro tenant — acesso negado' };
  }

  const tdb = tenantDb(trilha.empresa_id);
  const { data: colab } = await tdb.from('colaboradores')
    .select('nome_completo, cargo').eq('id', trilha.colaborador_id).maybeSingle();
  const nome = (colab?.nome_completo || '').split(' ')[0] || 'colab';

  // Filtra descritores que pertencem às competências da janela
  const todos = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
  const descritores = todos.filter((d: any) => d.competencia && competenciasFiltro.includes(d.competencia));
  if (!descritores.length) return { error: 'sem descritores para as competências dadas' };

  // Config pra saber nível-meta (Onboarding=2, regular=3) — do carimbo da trilha
  const programaConfig = await resolverConfigDaTrilha(sbRaw, trilha);
  const nivelMetaAlvo = programaConfig.nivelMetaAlvo;

  // Para cada competência, gera acumulada independente e agrega
  const acumuladosPorComp: any[] = [];
  for (const comp of competenciasFiltro) {
    const descsComp = descritores.filter((d: any) => d.competencia === comp);
    if (!descsComp.length) continue;
    const descritoresComRegua = await enriquecerComRegua({ db: tdb, sbGlobal: sbRaw, competencia: comp, descritores: descsComp });
    const descritoresFresh = await sobreporNotaFresh(tdb, trilha.colaborador_id, comp, descritoresComRegua);
    const evidenciasAcumuladas = await agregarEvidencias(tdb, trilhaId, descritoresFresh, trilha.temporada_plano, semFim);

    const { masked: colabMasked, map: piiMap } = maskColaborador(colab);
    const evidenciasMasked = maskTextPII(evidenciasAcumuladas, piiMap);

    try {
      const { system, user } = promptAvaliacaoAcumulada({
        competencia: comp,
        descritores: descritoresFresh,
        evidenciasAcumuladas: evidenciasMasked,
        nomeColab: colabMasked.nome,
        nivelMetaAlvo,
      });
      const r = await callAI(system, user, {}, 8000);
      const primaria = validateAvaliacaoAcumulada(parseJsonIA(r));
      if (primaria?.resumo_geral) primaria.resumo_geral = unmaskPII(primaria.resumo_geral, piiMap);
      acumuladosPorComp.push({ competencia: comp, primaria });
    } catch (err: any) {
      console.error(`[acumulada parcial ${comp}]`, err);
      acumuladosPorComp.push({ competencia: comp, error: err?.message });
    }
  }

  // Persiste em sem_fim.feedback.acumulado (mesma estrutura do completo)
  const payload = {
    gerado_em: new Date().toISOString(),
    parcial: true,
    competencias: competenciasFiltro,
    por_competencia: acumuladosPorComp,
  };
  const { data: progSemFim } = await tdb.from('temporada_semana_progresso')
    .select('id, feedback').eq('trilha_id', trilhaId).eq('semana', semFim).maybeSingle();
  if (progSemFim) {
    const novoFb = { ...(progSemFim.feedback || {}), acumulado: payload };
    await tdb.from('temporada_semana_progresso').update({ feedback: novoFb }).eq('id', progSemFim.id);
  } else {
    await tdb.from('temporada_semana_progresso').insert({
      trilha_id: trilhaId,
      colaborador_id: trilha.colaborador_id,
      semana: semFim, tipo: 'aplicacao', status: PROGRESSO.EM_ANDAMENTO,
      feedback: { acumulado: payload },
    });
  }

  return { ok: true, parcial: true, acumuladosPorComp };
}

// ── Helpers ──



async function agregarEvidencias(tdb: any, trilhaId: string, descritores: any[], plano: any, semanaLimite: number = 13, evidenciaPorCobertos: boolean = false) {
  const { data: progressos } = await tdb.from('temporada_semana_progresso')
    .select('semana, tipo, reflexao, feedback')
    .eq('trilha_id', trilhaId).lte('semana', semanaLimite).order('semana');
  if (!progressos?.length) return '';

  const planoArr = Array.isArray(plano) ? plano : [];
  const descritorPorSem = Object.fromEntries(planoArr.map(s => [s.semana, s.descritor]));
  const descritoresCobertosPorSem = Object.fromEntries(planoArr.map(s => [s.semana, s.descritores_cobertos || []]));

  const linhasPorDescritor = Object.fromEntries(descritores.map(d => [d.descritor, []]));

  for (const p of progressos) {
    if (p.tipo === 'conteudo' && p.reflexao) {
      // Piloto (evidenciaPorCobertos): a reflexão da semana cobre TODOS os
      // descritores da semana (2 entregas). Demais modos: só o `descritor`
      // principal, como sempre foi.
      const descsDaSemana = evidenciaPorCobertos
        ? (descritoresCobertosPorSem[p.semana]?.length ? descritoresCobertosPorSem[p.semana] : [descritorPorSem[p.semana]])
        : [descritorPorSem[p.semana]];
      for (const desc of descsDaSemana) {
        if (!desc || !linhasPorDescritor[desc]) continue;
        const partes = [
          `Sem ${p.semana}`,
          p.reflexao.insight_principal && `insight: "${p.reflexao.insight_principal}"`,
          p.reflexao.desafio_realizado && `desafio: ${p.reflexao.desafio_realizado}`,
          p.reflexao.qualidade_reflexao && `qualidade: ${p.reflexao.qualidade_reflexao}`,
          p.reflexao.sinais_extraidos?.exemplo_concreto && 'exemplo concreto: sim',
          p.reflexao.sinais_extraidos?.autopercepcao && 'autopercepção: sim',
        ].filter(Boolean).join(' · ');
        linhasPorDescritor[desc].push(partes);
      }
    }
    if (p.tipo === 'aplicacao' && p.feedback) {
      const cobertos = descritoresCobertosPorSem[p.semana] || [];
      const avals = Array.isArray(p.feedback.avaliacao_por_descritor) ? p.feedback.avaliacao_por_descritor : [];
      const modo = p.feedback.modo || 'cenario';
      for (const desc of cobertos) {
        if (!linhasPorDescritor[desc]) continue;
        const aval = avals.find(a => a.descritor === desc);
        const partes = [
          `Sem ${p.semana} (${modo === 'pratica' ? 'missão real' : 'cenário escrito'})`,
          aval?.observacao && `obs: "${aval.observacao}"`,
          aval?.nota && `nota: ${aval.nota}`,
          aval?.forca_evidencia && `força: ${aval.forca_evidencia}`,
          aval?.trecho_sustentador && `trecho: "${aval.trecho_sustentador}"`,
        ].filter(Boolean).join(' · ');
        if (partes) linhasPorDescritor[desc].push(partes);
      }
    }
    if (p.semana === 13 && p.reflexao?.evolucao_percebida) {
      for (const ev of p.reflexao.evolucao_percebida) {
        if (!linhasPorDescritor[ev.descritor]) continue;
        const partes = [
          `Sem 13 (auto-percepção)`,
          ev.antes && `antes: "${ev.antes}"`,
          ev.depois && `depois: "${ev.depois}"`,
          ev.evidencia && `evidência: "${ev.evidencia}"`,
          ev.nivel_percebido != null && `nível percebido: ${ev.nivel_percebido}`,
          ev.forca_evidencia && `força: ${ev.forca_evidencia}`,
          ev.confianca != null && `confiança: ${ev.confianca}`,
        ].filter(Boolean).join(' · ');
        linhasPorDescritor[ev.descritor].push(partes);
      }
    }
  }

  return descritores.map(d => {
    const linhas = linhasPorDescritor[d.descritor] || [];
    if (!linhas.length) return `### ${d.descritor}\n(sem evidência registrada)`;
    return `### ${d.descritor}\n- ${linhas.join('\n- ')}`;
  }).join('\n\n');
}
