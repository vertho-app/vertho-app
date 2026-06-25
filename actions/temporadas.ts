'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail } from '@/lib/authz';
import { selectDescriptors, selectDescriptorsMulti, selectDescriptorsDuo, type AssessmentPorCompetencia } from '@/lib/season-engine/select-descriptors';
import { buildSeason } from '@/lib/season-engine/build-season';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';
import { overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';
import { getProgramaConfig } from '@/lib/season-engine/programa-config';
import type { AIConfig } from './ai-client';
import { requireAdminAction, requireUserAction, getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { logAdminAction } from '@/lib/audit';

interface GerarTemporadaParams {
  colaboradorId?: string;
  competencia?: string;
  aiConfig?: AIConfig;
}

/**
 * Wrapper: carrega temporada do colab logado via email.
 */
export async function loadTemporadaPorEmail(email: string) {
  try {
    await requireUserAction();
    const colab = await findColabByEmail(email, 'id');
    if (!colab) return { error: 'Colab não encontrado' };
    return loadTemporada(colab.id);
  } catch (err: any) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Gera uma temporada pra um colaborador, focada em 1 competência.
 * Duração e cadência vêm de `empresas.sys_config` via `getProgramaConfig`
 * (default = regular 14 semanas).
 */
export async function gerarTemporada({ colaboradorId, competencia, aiConfig }: GerarTemporadaParams = {}) {
  try {
    const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
    if (!colaboradorId) return { error: 'colaboradorId obrigatório' };

    // Busca raw porque colaboradores é root de tenancy (descobre o tenant aqui).
    const { data: colab } = await sbRaw.from('colaboradores')
      .select('id, nome_completo, cargo, empresa_id, area_depto, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso')
      .eq('id', colaboradorId).maybeSingle();
    if (!colab) return { error: 'Colaborador não encontrado' };

    // A partir daqui, todas queries em tabelas tenant-owned passam por tdb.
    const tdb = tenantDb(colab.empresa_id);

    // 1) Determina competência foco — trilha existente → cargo → erro
    let competenciaAlvo = competencia;
    if (!competenciaAlvo) {
      const { data: trilhaExist } = await tdb.from('trilhas')
        .select('competencia_foco')
        .eq('colaborador_id', colaboradorId)
        .order('criado_em', { ascending: false })
        .limit(1).maybeSingle();
      competenciaAlvo = trilhaExist?.competencia_foco;
    }
    if (!competenciaAlvo && colab.cargo) {
      const { data: cargoEmp } = await tdb.from('cargos_empresa')
        .select('competencia_foco')
        .eq('nome', colab.cargo)
        .maybeSingle();
      competenciaAlvo = cargoEmp?.competencia_foco;
    }
    if (!competenciaAlvo) return { error: 'Sem competência foco definida pra este colaborador' };

    // 2) Descobre contexto/setor da empresa + sys_config.
    // empresas não tem coluna empresa_id (o id DELA é o tenant) → usa raw.
    const { data: empresa } = await sbRaw.from('empresas')
      .select('segmento, sys_config').eq('id', colab.empresa_id).maybeSingle();
    const contexto = inferirContexto(empresa?.segmento);
    const programaConfig = getProgramaConfig(empresa?.sys_config);
    const isOnboarding = programaConfig.modo === 'onboarding';

    // ── Modo Onboarding: trilha multi-competência ────────────────────────
    if (isOnboarding) {
      return await gerarTemporadaOnboarding({
        colab, empresa, tdb, sbRaw, contexto, programaConfig, aiConfig, competenciaPrincipal: competenciaAlvo,
      });
    }

    // ── Regular DUO (default global): 2 competências em blocos paralelos ──
    // Tenta a trilha de 2 comps; se o cargo não resolve 2 ou a 2ª comp não
    // tem assessment, faz fallback pro fluxo single-comp abaixo (não bloqueia
    // nem enviesa — comp âncora segue estrita).
    if ((programaConfig.numCompetencias || 1) >= 2) {
      const duo = await gerarTemporadaRegularDuo({
        colab, empresa, tdb, sbRaw, contexto, programaConfig, aiConfig, competenciaAncora: competenciaAlvo,
      });
      if (duo?.ok || duo?.error) return duo; // sucesso ou erro definitivo
      console.warn(`[gerarTemporada] DUO indisponível → fallback single (${competenciaAlvo}):`, duo?.motivo);
    }

    // 3) Prioridade de formatos — derivada das colunas pref_* em colaboradores
    const prioridadeFormatos = derivarPrioridadeFormatos(colab);

    // 4) Assessment de descritores
    let { data: assessment } = await tdb.from('descriptor_assessments')
      .select('descritor, nota')
      .eq('colaborador_id', colaboradorId)
      .eq('competencia', competenciaAlvo);

    // Anti-viés: se colab NÃO tem assessment da competência, exigimos que
    // seja feito ANTES da trilha. Não mais default 1.5 que enviesa a alocação
    // de semanas ao tratar ausência como "gap moderado".
    if (!assessment || assessment.length === 0) {
      return {
        error: `Colaborador ainda não tem avaliação (descriptor_assessments) para "${competenciaAlvo}". Rode a rodada de mapeamento antes de gerar a temporada — default 1.5 causa viés na seleção de descritores.`,
        codigo: 'sem_assessment',
      };
    }

    // Cobertura mínima: se não tem assessment pra TODOS os descritores da
    // competência, marca os ausentes como "não avaliado" (não contam na
    // alocação — selectDescriptors ignora quem não tem nota).
    const { data: descsEmp } = await tdb.from('competencias')
      .select('nome_curto')
      .eq('nome', competenciaAlvo)
      .not('nome_curto', 'is', null);
    let descritoresCatalogo: string[] = [...new Set<string>((descsEmp || []).map((b: any) => b.nome_curto))];
    if (descritoresCatalogo.length === 0) {
      // competencias_base é tabela GLOBAL (catálogo nacional) → raw.
      const { data: base } = await sbRaw.from('competencias_base')
        .select('nome_curto').eq('nome', competenciaAlvo).not('nome_curto', 'is', null);
      descritoresCatalogo = [...new Set<string>((base || []).map((b: any) => b.nome_curto))];
    }

    const avaliadosSet = new Set(assessment.map((a: any) => a.descritor));
    const ausentes = descritoresCatalogo.filter(d => !avaliadosSet.has(d));
    if (ausentes.length > 0) {
      console.warn(`[gerarTemporada] ${ausentes.length} descritor(es) sem avaliação — ignorados na alocação:`, ausentes);
    }

    if (assessment.length === 0) {
      return { error: `Competência "${competenciaAlvo}" sem descritores cadastrados — pule esta competência ou cadastre os descritores antes` };
    }

    // 5) Seleciona descritores e aloca semanas
    const descritoresSelecionados = selectDescriptors(assessment, programaConfig.slotsConteudo);

    // 6) Monta plano de N semanas (com IA pra desafios + cenários)
    const semanas = await buildSeason({
      descritoresSelecionados,
      competencia: competenciaAlvo,
      cargo: colab.cargo,
      contexto,
      prioridadeFormatos,
      empresaId: colab.empresa_id,
      aiConfig,
      programaConfig,
    });

    // 7) Persiste em trilhas (estende registro existente ou cria novo)
    // (semanas é o output de buildSeason — array de SemanaPlan)
    const { data: existente } = await tdb.from('trilhas')
      .select('id, numero_temporada')
      .eq('colaborador_id', colaboradorId)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle();

    // Com UPDATE na mesma row, regenerar não deve inflar o contador.
    // Mantém o número da temporada existente; só começa em 1 se for primeira vez.
    const numeroTemporada = existente?.numero_temporada || 1;
    const { nextMondayISO } = await import('@/lib/season-engine/week-gating');
    // empresa_id é injetado pelo tdb.insert/upsert/update — não precisa repetir aqui.
    const payload = {
      colaborador_id: colaboradorId,
      competencia_foco: competenciaAlvo,
      competencias_foco: [competenciaAlvo], // uniformiza com DUO (Fase 3 lê sempre o array)
      numero_temporada: numeroTemporada,
      temporada_plano: semanas,
      descritores_selecionados: descritoresSelecionados,
      status: 'ativa',
      data_inicio: nextMondayISO(), // semana 1 libera na próxima segunda às 03:00 BRT
      cursos: [], // campo legado, conteúdo agora vive em temporada_plano
    };

    // Constraint única: 1 trilha por (empresa, colab). Sempre UPDATE se existe.
    let trilhaId: string;
    if (existente) {
      const { error } = await tdb.from('trilhas').update(payload).eq('id', existente.id);
      if (error) return { error: error.message };
      trilhaId = existente.id;
    } else {
      const { data: nova, error } = await tdb.from('trilhas').insert(payload).select('id').maybeSingle();
      if (error) return { error: error.message };
      trilhaId = nova.id;
    }

    // 8) Cria registros de progresso (semana 1 = disponível, demais = bloqueada)
    const progressos = semanas.map((s: any) => ({
      trilha_id: trilhaId,
      colaborador_id: colaboradorId,
      semana: s.semana,
      tipo: s.tipo,
      status: s.semana === 1 ? 'em_andamento' : 'pendente',
    }));
    await tdb.from('temporada_semana_progresso').delete().eq('trilha_id', trilhaId);
    await tdb.from('temporada_semana_progresso').insert(progressos);

    return {
      ok: true,
      trilhaId,
      numeroTemporada,
      competencia: competenciaAlvo,
      descritores: descritoresSelecionados.length,
      semanas: semanas.length,
    };
  } catch (err: any) {
    console.error('[gerarTemporada]', err);
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Modo Onboarding: trilha de 10 semanas em espiral cobrindo até 5 competências.
 *
 * Estratégia:
 *  1. Resolve as N competências (sys_config.competencias_onboarding[] OR top10_cargos[0..4] do cargo)
 *  2. Carrega assessment de descritores pra cada competência
 *  3. selectDescriptorsMulti aloca 1 descritor/competência nos slots [2,3,5,6,8]
 *  4. buildSeason recebe `competencias` array + plano monta missões integradoras
 *  5. Persiste em `trilhas.competencias_foco TEXT[]` (migration 091)
 */
async function gerarTemporadaOnboarding(args: {
  colab: any; empresa: any; tdb: any; sbRaw: any; contexto: string;
  programaConfig: any; aiConfig?: AIConfig; competenciaPrincipal: string;
}) {
  const { colab, empresa, tdb, sbRaw, contexto, programaConfig, aiConfig, competenciaPrincipal } = args;
  const N = programaConfig.numCompetencias || 5;

  // 1) Lista de competências da trilha. Fonte de verdade:
  //    a) sys_config.competencias_onboarding (override manual do RH)
  //    b) top10_cargos do cargo, pegando as N primeiras (validadas via IA1)
  let competencias: string[] = Array.isArray(empresa?.sys_config?.competencias_onboarding)
    ? empresa.sys_config.competencias_onboarding.slice(0, N)
    : [];

  if (competencias.length < N) {
    // Fallback: pega top N do cargo em top10_cargos
    const { data: top10 } = await tdb.from('top10_cargos')
      .select('competencia_id, posicao')
      .eq('cargo', colab.cargo || '')
      .order('posicao')
      .limit(N);
    if (top10?.length) {
      const ids = top10.map((t: any) => t.competencia_id);
      const { data: comps } = await tdb.from('competencias')
        .select('id, nome')
        .in('id', ids);
      const mapaIdNome = Object.fromEntries((comps || []).map((c: any) => [c.id, c.nome]));
      const nomesPorPosicao = top10
        .map((t: any) => mapaIdNome[t.competencia_id])
        .filter(Boolean);
      // Dedup mantendo ordem
      competencias = [...new Set<string>([...competencias, ...nomesPorPosicao])].slice(0, N);
    }
  }

  if (competencias.length === 0) {
    return {
      error: `Modo Onboarding precisa de pelo menos 1 competência. Configure sys_config.competencias_onboarding ou rode IA1 pro cargo "${colab.cargo}".`,
      codigo: 'onboarding_sem_competencias',
    };
  }

  // 2) Assessment por competência. Cada competência precisa de pelo menos 1 descritor avaliado.
  const assessments: AssessmentPorCompetencia[] = [];
  for (const comp of competencias) {
    const { data: rows } = await tdb.from('descriptor_assessments')
      .select('descritor, nota')
      .eq('colaborador_id', colab.id)
      .eq('competencia', comp);
    if (rows && rows.length > 0) {
      assessments.push({ competencia: comp, assessment: rows });
    } else {
      console.warn(`[gerarTemporadaOnboarding] ${comp} sem assessment — usará default neutro`);
      assessments.push({ competencia: comp, assessment: [{ descritor: 'Descritor padrão', nota: 1.5 }] });
    }
  }

  // 3) Distribui 1 descritor por competência nos slots de fundamento ([2,3,5,6,8])
  if (!programaConfig.semanaParaCompetenciaIdx) {
    return { error: 'ProgramaConfig sem semanaParaCompetenciaIdx — não dá pra rodar Onboarding.' };
  }
  const descritoresSelecionados = selectDescriptorsMulti(assessments, programaConfig.semanaParaCompetenciaIdx);
  if (descritoresSelecionados.length === 0) {
    return { error: 'Nenhum descritor selecionado — verifique assessments das competências do Onboarding.' };
  }

  // 4) Monta plano (com IA pra missões integradoras + cenários)
  const prioridadeFormatos = derivarPrioridadeFormatos(colab);
  const semanas = await buildSeason({
    descritoresSelecionados,
    competencia: competencias[0], // âncora (1ª comp)
    competencias,
    cargo: colab.cargo,
    contexto,
    prioridadeFormatos,
    empresaId: colab.empresa_id,
    aiConfig,
    programaConfig,
  });

  // 5) Persiste em `trilhas` (UPDATE se existir, INSERT senão)
  const { data: existente } = await tdb.from('trilhas')
    .select('id, numero_temporada')
    .eq('colaborador_id', colab.id)
    .order('criado_em', { ascending: false }).limit(1).maybeSingle();
  const numeroTemporada = existente?.numero_temporada || 1;
  const { nextMondayISO } = await import('@/lib/season-engine/week-gating');
  const payload = {
    colaborador_id: colab.id,
    competencia_foco: competencias[0],            // compat — guarda âncora
    competencias_foco: competencias,              // multi (migration 091)
    numero_temporada: numeroTemporada,
    temporada_plano: semanas,
    descritores_selecionados: descritoresSelecionados,
    status: 'ativa',
    data_inicio: nextMondayISO(),
    cursos: [],
  };
  let trilhaId: string;
  if (existente) {
    const { error } = await tdb.from('trilhas').update(payload).eq('id', existente.id);
    if (error) return { error: error.message };
    trilhaId = existente.id;
  } else {
    const { data: nova, error } = await tdb.from('trilhas').insert(payload).select('id').maybeSingle();
    if (error) return { error: error.message };
    trilhaId = nova.id;
  }

  // 6) Progresso
  const progressos = semanas.map((s: any) => ({
    trilha_id: trilhaId,
    colaborador_id: colab.id,
    semana: s.semana,
    tipo: s.tipo,
    status: s.semana === 1 ? 'em_andamento' : 'pendente',
  }));
  await tdb.from('temporada_semana_progresso').delete().eq('trilha_id', trilhaId);
  await tdb.from('temporada_semana_progresso').insert(progressos);

  return {
    ok: true,
    trilhaId,
    numeroTemporada,
    competencia: competencias[0],
    competencias,
    descritores: descritoresSelecionados.length,
    semanas: semanas.length,
    modo: 'onboarding',
  };
}

/**
 * Regular DUO: trilha de 14 semanas (profundidade nível-meta 3) cobrindo
 * 2 competências em blocos paralelos, missões 4/8/12 integradoras.
 *
 * Resolve as 2 comps por: (a) sys_config.competencias_regular_duo (override)
 * OU (b) top-2 do cargo em top10_cargos, com a competência âncora (trilha/
 * cargo existente) em 1º pra continuidade.
 *
 * Retorna `{ _fallbackSingle: true, motivo }` quando não dá pra rodar DUO
 * (cargo sem 2 comps, ou 2ª comp sem assessment) — o caller cai no fluxo
 * single-comp. `{ error }` = falha definitiva. `{ ok }` = trilha gerada.
 */
async function gerarTemporadaRegularDuo(args: {
  colab: any; empresa: any; tdb: any; sbRaw: any; contexto: string;
  programaConfig: any; aiConfig?: AIConfig; competenciaAncora?: string;
}): Promise<any> {
  const { colab, empresa, tdb, contexto, programaConfig, aiConfig, competenciaAncora } = args;

  // 1) Resolve 2 competências
  let comps: string[] = Array.isArray(empresa?.sys_config?.competencias_regular_duo)
    ? empresa.sys_config.competencias_regular_duo.slice(0, 2)
    : [];
  if (comps.length < 2) {
    const { data: top10 } = await tdb.from('top10_cargos')
      .select('competencia_id, posicao')
      .eq('cargo', colab.cargo || '')
      .order('posicao')
      .limit(10);
    if (top10?.length) {
      const ids = top10.map((t: any) => t.competencia_id);
      const { data: cc } = await tdb.from('competencias').select('id, nome').in('id', ids);
      const mapa = Object.fromEntries((cc || []).map((c: any) => [c.id, c.nome]));
      const nomesTop = top10.map((t: any) => mapa[t.competencia_id]).filter(Boolean);
      // Âncora primeiro (continuidade com trilha existente), depois top do cargo
      const ordered = [competenciaAncora, ...nomesTop].filter(Boolean) as string[];
      comps = [...new Set<string>(ordered)].slice(0, 2);
    } else if (competenciaAncora) {
      comps = [competenciaAncora];
    }
  }

  if (comps.length < 2) {
    return { _fallbackSingle: true, motivo: 'cargo sem 2 competências resolvíveis' };
  }

  // 2) Assessment por competência (anti-viés: SEM default 1.5 — exige avaliação)
  const assessmentPorComp: Record<string, any[]> = {};
  for (const c of comps) {
    const { data } = await tdb.from('descriptor_assessments')
      .select('descritor, nota')
      .eq('colaborador_id', colab.id)
      .eq('competencia', c);
    assessmentPorComp[c] = data || [];
  }
  if ((assessmentPorComp[comps[0]] || []).length === 0) {
    // Nem a âncora tem assessment → erro padrão de mapeamento (single trata).
    return { _fallbackSingle: true, motivo: `sem assessment pra ${comps[0]}` };
  }
  const semAssessment = comps.filter(c => (assessmentPorComp[c] || []).length === 0);
  if (semAssessment.length > 0) {
    // 2ª comp sem assessment → degrada pra single (não bloqueia, não enviesa)
    return { _fallbackSingle: true, degradou: true, motivo: `sem assessment pra ${semAssessment.join(', ')} — rode o mapeamento dessa competência` };
  }

  // 3) Seleção PROFUNDA de descritores para as 2 comps (blocos paralelos)
  const descritoresSelecionados = selectDescriptorsDuo(
    comps[0], assessmentPorComp[comps[0]],
    comps[1], assessmentPorComp[comps[1]],
    programaConfig.slotsConteudo,
  );
  if (descritoresSelecionados.length === 0) {
    return { _fallbackSingle: true, motivo: 'nenhum descritor selecionado nas 2 comps' };
  }

  // 4) Monta o plano (missões integradoras via competenciasNaMissao)
  const prioridadeFormatos = derivarPrioridadeFormatos(colab);
  const semanas = await buildSeason({
    descritoresSelecionados,
    competencia: comps[0],   // âncora
    competencias: comps,     // multi → buildSeason.isMulti = true
    cargo: colab.cargo,
    contexto,
    prioridadeFormatos,
    empresaId: colab.empresa_id,
    aiConfig,
    programaConfig,
  });

  // 5) Persiste (UPDATE se existir, INSERT senão)
  const { data: existente } = await tdb.from('trilhas')
    .select('id, numero_temporada')
    .eq('colaborador_id', colab.id)
    .order('criado_em', { ascending: false }).limit(1).maybeSingle();
  const numeroTemporada = existente?.numero_temporada || 1;
  const { nextMondayISO } = await import('@/lib/season-engine/week-gating');
  const payload = {
    colaborador_id: colab.id,
    competencia_foco: comps[0],       // compat — âncora
    competencias_foco: comps,         // multi (migration 091)
    numero_temporada: numeroTemporada,
    temporada_plano: semanas,
    descritores_selecionados: descritoresSelecionados,
    status: 'ativa',
    data_inicio: nextMondayISO(),
    cursos: [],
  };
  let trilhaId: string;
  if (existente) {
    const { error } = await tdb.from('trilhas').update(payload).eq('id', existente.id);
    if (error) return { error: error.message };
    trilhaId = existente.id;
  } else {
    const { data: nova, error } = await tdb.from('trilhas').insert(payload).select('id').maybeSingle();
    if (error) return { error: error.message };
    trilhaId = nova.id;
  }

  const progressos = semanas.map((s: any) => ({
    trilha_id: trilhaId,
    colaborador_id: colab.id,
    semana: s.semana,
    tipo: s.tipo,
    status: s.semana === 1 ? 'em_andamento' : 'pendente',
  }));
  await tdb.from('temporada_semana_progresso').delete().eq('trilha_id', trilhaId);
  await tdb.from('temporada_semana_progresso').insert(progressos);

  return {
    ok: true,
    trilhaId,
    numeroTemporada,
    competencia: comps[0],
    competencias: comps,
    descritores: descritoresSelecionados.length,
    semanas: semanas.length,
    modo: 'regular_duo',
  };
}

function derivarPrioridadeFormatos(colab: any): string[] {
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

function resolveCompetenciasSlot(trilha: any, slot: any): string[] {
  const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
  const byDesc = new Map<string, string>(
    descritores
      .map((d: any) => [String(d.descritor), String(d.competencia || '')] as [string, string])
      .filter(([, c]) => !!c),
  );
  const comps = new Set<string>();
  if (slot?.competencia) comps.add(slot.competencia);
  if (Array.isArray(slot?.competencias_cobertas)) {
    for (const comp of slot.competencias_cobertas) if (comp) comps.add(comp);
  }
  if (slot?.descritor && byDesc.get(slot.descritor)) comps.add(byDesc.get(slot.descritor)!);
  for (const desc of slot?.descritores_cobertos || []) {
    const comp = byDesc.get(desc);
    if (comp) comps.add(comp);
  }
  if (!comps.size) comps.add(trilha.competencia_foco);
  return Array.from(comps);
}

function resolveCompetenciaSlot(trilha: any, slot: any): string {
  return resolveCompetenciasSlot(trilha, slot).join(' + ');
}

function inferirContexto(segmento?: string | null): string {
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
export async function gerarTemporadasLote(empresaId: string, aiConfig?: AIConfig) {
  try {
    const sb = await requireAdminSupabase('ai.audit.regenerate');
    if (!empresaId) return { error: 'empresaId obrigatório' };
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo').eq('empresa_id', empresaId);
    if (!colabs?.length) return { error: 'Sem colaboradores' };

    const resultados: any[] = [];
    for (const c of colabs) {
      const r = await gerarTemporada({ colaboradorId: c.id, aiConfig });
      resultados.push({ colab: c.nome_completo, ...r });
    }
    const ok = resultados.filter(r => r.ok).length;
    const errosUnicos = [...new Set(resultados.filter(r => !r.ok).map(r => r.error))].slice(0, 3);
    await logAdminAction({
      adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
      acao: 'temporada.gerar_lote', empresaId,
      alvo: `${colabs.length} colaboradores`,
      detalhes: { total: colabs.length, gerados: ok, erros: colabs.length - ok, errosUnicos },
      resultado: ok === 0 ? 'erro' : ok < colabs.length ? 'parcial' : 'ok',
    });
    return {
      success: true,
      total: colabs.length,
      gerados: ok,
      resultados,
      message: `${ok}/${colabs.length} temporadas geradas${errosUnicos.length ? ` · erros: ${errosUnicos.join('; ')}` : ''}`,
    };
  } catch (err: any) {
    console.error('[gerarTemporadasLote]', err);
    return { success: false, error: err?.message || 'Erro' };
  }
}

/**
 * Pausa/retoma uma temporada (toggle baseado no status atual).
 */
export async function pausarRetomarTemporada(trilhaId: string) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    const { data: t } = await sb.from('trilhas').select('status').eq('id', trilhaId).maybeSingle();
    if (!t) return { success: false, error: 'Trilha não encontrada' };
    const novo = t.status === 'pausada' ? 'ativa' : 'pausada';
    const { error } = await sb.from('trilhas').update({ status: novo }).eq('id', trilhaId);
    if (error) return { success: false, error: error.message };
    return { success: true, status: novo, message: `Temporada ${novo}` };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Antecipa o início da temporada para liberar as semanas IMEDIATAMENTE (teste/demo).
 * Seta data_inicio para a segunda-feira corrente (SP) — semana 1 libera na hora e as
 * seguintes mantêm o ritmo de 7 dias. Em produção, data_inicio nasce na próxima segunda.
 */
export async function anteciparInicioTemporada(trilhaId: string) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!trilhaId) return { success: false, error: 'trilhaId obrigatório' };
    // Segunda-feira corrente em SP (BRT, UTC-3): a segunda <= hoje.
    const SP_OFFSET_H = 3;
    const sp = new Date(Date.now() - SP_OFFSET_H * 3600 * 1000);
    const dow = sp.getUTCDay(); // 0=dom..6=sab
    const diasDesdeSegunda = (dow + 6) % 7; // seg=0, ter=1, ..., dom=6
    const segunda = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() - diasDesdeSegunda));
    const dataInicio = segunda.toISOString().slice(0, 10);
    const { error } = await sb.from('trilhas').update({ data_inicio: dataInicio }).eq('id', trilhaId);
    if (error) return { success: false, error: error.message };
    return { success: true, dataInicio, message: `Semanas liberadas (início ${dataInicio})` };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function arquivarTemporada(trilhaId: string) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    const { error } = await sb.from('trilhas').update({ status: 'arquivada' }).eq('id', trilhaId);
    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Arquivada' };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Regera desafio (semana de conteúdo) OU cenário (semana de aplicação)
 * para uma semana específica. Reseta o progresso.
 */
export async function regerarSemana(trilhaId: string, semana: number, aiConfig: AIConfig = {}) {
  try {
    const sb = await requireAdminSupabase('ai.audit.regenerate');
    const { data: trilha } = await sb.from('trilhas')
      .select('id, colaborador_id, empresa_id, competencia_foco, competencias_foco, temporada_plano, descritores_selecionados')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return { success: false, error: 'Trilha não encontrada' };

    const plano: any[] = Array.isArray(trilha.temporada_plano) ? [...trilha.temporada_plano] : [];
    const idx = plano.findIndex((s: any) => s.semana === Number(semana));
    if (idx < 0) return { success: false, error: 'Semana não encontrada no plano' };

    const { data: colab } = await sb.from('colaboradores')
      .select('cargo, empresa_id').eq('id', trilha.colaborador_id).maybeSingle();
    const { data: empresa } = await sb.from('empresas').select('segmento').eq('id', trilha.empresa_id).maybeSingle();
    const contexto = empresa?.segmento?.toLowerCase().includes('educa') ? 'educacional' : 'corporativo';

    const slot = plano[idx];
    const { callAI } = await import('@/actions/ai-client');
    const competenciaSlot = resolveCompetenciaSlot(trilha, slot);

    if (slot.tipo === 'conteudo' && slot.descritor) {
      const { promptDesafio, parseDesafioResponse } = await import('@/lib/season-engine/prompts/challenge');
      const { system, user } = promptDesafio({
        competencia: competenciaSlot,
        descritor: slot.descritor,
        nivel: slot.nivel_atual || 1.5,
        cargo: colab?.cargo, contexto, semana,
      });
      const rawResp = (await callAI(system, user, aiConfig, 400)).trim();
      const parsed = parseDesafioResponse(rawResp);
      const desafioFields = parsed
        ? { desafio_texto: parsed.desafio_texto, acao_observavel: parsed.acao_observavel, criterio_de_execucao: parsed.criterio_de_execucao, por_que_cabe_na_semana: parsed.por_que_cabe_na_semana }
        : { desafio_texto: rawResp };
      plano[idx] = { ...slot, conteudo: { ...(slot.conteudo || {}), ...desafioFields } };
    } else if (slot.tipo === 'aplicacao') {
      const { promptCenario, parseCenarioResponse, cenarioToMarkdown } = await import('@/lib/season-engine/prompts/scenario');
      const { promptMissao, parseMissaoResponse, missaoToMarkdown } = await import('@/lib/season-engine/prompts/missao');
      const complexidade = ({ 4: 'simples', 8: 'intermediario', 12: 'completo' } as Record<number, string>)[semana] || 'intermediario';
      const descritores = slot.descritores_cobertos || [];
      const comps = resolveCompetenciasSlot(trilha, slot);
      const m = promptMissao({
        competencia: competenciaSlot,
        descritores,
        cargo: colab?.cargo,
        contexto,
        missaoTipo: comps.length > 1 ? 'integradora' : 'unica',
        competenciasIntegradas: comps.length > 1 ? comps : undefined,
      });
      const c = promptCenario({
        competencia: competenciaSlot,
        descritores,
        cargo: colab?.cargo,
        contexto,
        complexidade,
        cenarioTipo: comps.length > 1 ? 'integrador' : 'unico',
        competenciasIntegradas: comps.length > 1 ? comps : undefined,
      });
      const [mResp, cResp] = await Promise.all([
        callAI(m.system, m.user, aiConfig, 600),
        callAI(c.system, c.user, aiConfig, 800),
      ]);

      const missaoParsed = parseMissaoResponse(mResp);
      const missaoObj = missaoParsed
        ? { texto: missaoToMarkdown(missaoParsed), acao_principal: missaoParsed.acao_principal, contexto_de_aplicacao: missaoParsed.contexto_de_aplicacao, criterio_de_execucao: missaoParsed.criterio_de_execucao, integracao_descritores: missaoParsed.integracao_descritores }
        : { texto: (mResp || '').trim() };

      const cenarioParsed = parseCenarioResponse(cResp);
      const cenarioObj = cenarioParsed
        ? { texto: cenarioToMarkdown(cenarioParsed), complexidade, tensao_central: cenarioParsed.tensao_central, tradeoff_testado: cenarioParsed.tradeoff_testado, armadilha_resposta_generica: cenarioParsed.armadilha_resposta_generica, stakeholders: cenarioParsed.stakeholders }
        : { texto: (cResp || '').trim(), complexidade };

      plano[idx] = { ...slot, missao: missaoObj, cenario: cenarioObj };
    } else {
      return { success: false, error: 'Semana de avaliação não pode ser regerada' };
    }

    await sb.from('trilhas').update({ temporada_plano: plano }).eq('id', trilhaId);

    // Reseta progresso da semana
    await sb.from('temporada_semana_progresso')
      .update({ status: 'pendente', conteudo_consumido: false, reflexao: null, feedback: null, iniciado_em: null, concluido_em: null })
      .eq('trilha_id', trilhaId).eq('semana', Number(semana));

    return { success: true, message: `Semana ${semana} regerada` };
  } catch (err: any) {
    console.error('[VERTHO] regerarSemana:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Lista temporadas de uma empresa (admin viewer).
 */
/**
 * Aplica o overlay do Kit num plano de temporada (mutação best-effort). Espelha o
 * desafio/conteúdo REAL que o colaborador vê — usado nas telas de admin pra não
 * exibir o fallback do buildSeason quando já existe Kit. `colab` precisa de
 * perfil_dominante + prefs + empresa_id.
 */
async function aplicarOverlayKit(sb: any, plano: any[], colab: any, trilha: { competencia_foco?: any; competencias_foco?: any }) {
  if (!colab?.empresa_id || !Array.isArray(plano)) return;
  try {
    const formatoPref = formatoPreferido(colab);
    const disc = (colab.perfil_dominante || '').charAt(0).toUpperCase() || null;
    const competenciaFoco = trilha.competencia_foco || (Array.isArray(trilha.competencias_foco) ? trilha.competencias_foco[0] : null);
    await Promise.all(
      plano.filter((s: any) => s?.tipo === 'conteudo').map((s: any) =>
        overlayKitNaSemana(sb, s, { empresaId: colab.empresa_id, disc, formatoPref, competenciaFoco }),
      ),
    );
  } catch { /* best-effort — nunca quebra a tela */ }
}

/**
 * Pré-gera (e cacheia) as ENTREGAS personalizadas (PDF texto/case + áudio) das
 * semanas JÁ LIBERADAS de cada colaborador — pra abertura instantânea (em vez de
 * gerar on-demand no 1º clique). Idempotente: pula o que já está cacheado.
 * Limita às semanas liberadas (não as 14) p/ não gerar o que ninguém vai abrir já.
 */
export async function prepararEntregasJornada(empresaId: string, opts: { colaboradorId?: string } = {}) {
  await requireAdminAction('content.manage');
  if (!empresaId) return { error: 'empresaId obrigatório' as const };
  const { gerarConteudoFinalPersonalizado, prepararAudioPersonalizado } = await import('@/actions/conteudos');
  const { semanaLiberadaPorData } = await import('@/lib/season-engine/week-gating');
  const tdb = tenantDb(empresaId);

  const colCols = 'id, nome_completo, cargo, empresa_id, perfil_dominante, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso';
  let cq = tdb.from('colaboradores').select(colCols);
  if (opts.colaboradorId) cq = cq.eq('id', opts.colaboradorId);
  const { data: colabs } = await cq;
  if (!colabs?.length) return { error: 'Sem colaboradores' as const };

  let preparadas = 0, jaProntas = 0, falhas = 0, semanas = 0;
  for (const colab of colabs as any[]) {
    const { data: trilha } = await tdb.from('trilhas')
      .select('competencia_foco, competencias_foco, temporada_plano, data_inicio')
      .eq('colaborador_id', colab.id).order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (!trilha?.temporada_plano) continue;
    const plano = normalizeTemporadaPlano(trilha.temporada_plano);
    // Overlay com client RAW (não tdb): resolverKitDaSemana usa .or(empresa OR
    // global), que o wrapper tenant-scoped quebra. Mesmo client do loadTemporada.
    await aplicarOverlayKit(createSupabaseAdmin(), plano, colab, trilha);

    for (const s of plano) {
      if (s?.tipo !== 'conteudo') continue;
      if (!semanaLiberadaPorData(trilha.data_inicio, s.semana)) continue; // só liberadas
      semanas++;
      const conteudos = Array.isArray(s.conteudos_dia) && s.conteudos_dia.length
        ? s.conteudos_dia.map((e: any) => e.conteudo).filter(Boolean)
        : (s.conteudo ? [s.conteudo] : []);
      for (const cont of conteudos) {
        const fmts = cont.formatos_disponiveis || {};
        for (const [formato, info] of Object.entries(fmts) as [string, any][]) {
          if (formato === 'video') continue; // vídeo é do pipeline de célula
          const cid = info?.id;
          if (!cid) continue;
          const r = formato === 'audio'
            ? await prepararAudioPersonalizado({ contentId: cid, colab })
            : await gerarConteudoFinalPersonalizado({ contentId: cid, colab });
          if ((r as any)?.cached) jaProntas++;
          else if ((r as any)?.success) preparadas++;
          else falhas++;
        }
      }
    }
  }
  return { ok: true as const, colaboradores: colabs.length, semanas, preparadas, jaProntas, falhas };
}

export async function listarTemporadasEmpresa(empresaId: string) {
  try {
    await requireAdminAction();
    if (!empresaId) return { error: 'empresaId obrigatório' };
    const tdb = tenantDb(empresaId);
    const { data, error } = await tdb.from('trilhas')
      .select('id, colaborador_id, competencia_foco, competencias_foco, numero_temporada, status, criado_em, descritores_selecionados, temporada_plano')
      .not('temporada_plano', 'is', null)
      .order('criado_em', { ascending: false });
    if (error) return { error: error.message };

    const ids = (data || []).map((t: any) => t.colaborador_id);
    const { data: colabs } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, empresa_id, perfil_dominante, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso').in('id', ids);
    const colabMap = Object.fromEntries((colabs || []).map((c: any) => [c.id, c]));

    const items = await Promise.all((data || []).map(async (t: any) => {
      const plano = normalizeTemporadaPlano(t.temporada_plano);
      const colab = colabMap[t.colaborador_id] || null;
      // Overlay do Kit (client RAW: resolverKitDaSemana usa .or(empresa OR global),
      // incompatível com o wrapper tenant-scoped). Mostra o conteúdo REAL.
      if (colab) await aplicarOverlayKit(createSupabaseAdmin(), plano, colab, t);
      return { ...t, temporada_plano: plano, colab };
    }));
    return { items };
  } catch (err: any) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Marca o conteúdo core de uma semana como consumido.
 */
export async function marcarConteudoConsumido(trilhaId: string, semana: number) {
  try {
    await requireUserAction();
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
      const tipo = (t?.temporada_plano || []).find((s: any) => s.semana === semana)?.tipo || 'conteudo';
      await sb.from('temporada_semana_progresso').insert({
        trilha_id: trilhaId, empresa_id: t.empresa_id, colaborador_id: t.colaborador_id,
        semana, tipo, ...payload,
      });
    }
    return { ok: true };
  } catch (err: any) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Carrega progresso detalhado de todas as semanas de uma trilha (admin view).
 * Inclui transcripts completos de reflexão/feedback/avaliação.
 */
export async function loadProgressoDetalhado(trilhaId: string) {
  try {
    const sb = await requireAdminSupabase();
    const { data: trilha } = await sb.from('trilhas')
      .select('id, colaborador_id, competencia_foco, competencias_foco, temporada_plano, evolution_report')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return { error: 'Trilha não encontrada' };

    const { data: progresso } = await sb.from('temporada_semana_progresso')
      .select('*').eq('trilha_id', trilhaId).order('semana');

    const { data: colab } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo, empresa_id, perfil_dominante, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso')
      .eq('id', trilha.colaborador_id).maybeSingle();

    const plano = normalizeTemporadaPlano(trilha.temporada_plano);
    // Overlay do Kit: o admin vê o desafio/conteúdo REAL (igual ao colaborador).
    if (colab) await aplicarOverlayKit(sb, plano, colab, trilha);

    return {
      success: true,
      trilha: { ...trilha, temporada_plano: plano },
      colab,
      progresso: progresso || [],
    };
  } catch (err: any) {
    return { error: err?.message };
  }
}

/**
 * Carrega a temporada ativa de um colaborador (com plano + progresso).
 */
export async function loadTemporada(colaboradorId: string) {
  try {
    await requireUserAction();
    if (!colaboradorId) return { error: 'colaboradorId obrigatório' };

    // Descobre empresa_id do colab pra poder usar tenantDb (que força filtro).
    // Uso raw aqui porque colaboradores busca é a fonte do tenantId.
    const sbRaw = createSupabaseAdmin();
    const { data: colaborador } = await sbRaw.from('colaboradores')
      .select('id, nome_completo, cargo, email, perfil_dominante, empresa_id, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso')
      .eq('id', colaboradorId).maybeSingle();
    if (!colaborador?.empresa_id) return { error: 'Colab sem empresa_id' };

    // A partir daqui, todas queries em tabelas tenant-owned passam por tenantDb.
    // Se alguém adicionar .from('trilhas').select() sem .eq('empresa_id'),
    // o wrapper garante que o filtro vai.
    const tdb = tenantDb(colaborador.empresa_id);

    const { data: trilha } = await tdb.from('trilhas')
      .select('*').eq('colaborador_id', colaboradorId)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (!trilha) return { error: 'Sem temporada' };

    const { data: progresso } = await tdb.from('temporada_semana_progresso')
      .select('*').eq('trilha_id', trilha.id).order('semana');

    let plano = normalizeTemporadaPlano(trilha.temporada_plano);

    // Fase 4 (entrega do Kit): se existir kit pra (empresa×competência×descritor×DISC),
    // os formatos da semana viram os do kit, o principal = formato preferido da pessoa,
    // e o desafio = o do kit. Aditivo: sem kit, o conteúdo (buildSeason) permanece.
    await aplicarOverlayKit(sbRaw, plano, colaborador, trilha);

    return {
      ok: true,
      trilha: {
        ...trilha,
        temporada_plano: plano,
      },
      progresso: progresso || [],
      colaborador,
    };
  } catch (err: any) {
    return { error: err?.message || 'Erro' };
  }
}
