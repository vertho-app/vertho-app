'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail } from '@/lib/authz';
import { selectDescriptors } from '@/lib/season-engine/select-descriptors';
import { buildSeason } from '@/lib/season-engine/build-season';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';
import type { AIConfig } from './ai-client';

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
    const colab = await findColabByEmail(email, 'id');
    if (!colab) return { error: 'Colab não encontrado' };
    return loadTemporada(colab.id);
  } catch (err: any) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Gera uma temporada de 14 semanas pra um colaborador, focada em 1 competência.
 */
export async function gerarTemporada({ colaboradorId, competencia, aiConfig }: GerarTemporadaParams = {}) {
  try {
    if (!colaboradorId) return { error: 'colaboradorId obrigatório' };
    const sbRaw = createSupabaseAdmin();

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

    // 2) Descobre contexto/setor da empresa.
    // empresas não tem coluna empresa_id (o id DELA é o tenant) → usa raw.
    const { data: empresa } = await sbRaw.from('empresas')
      .select('segmento').eq('id', colab.empresa_id).maybeSingle();
    const contexto = inferirContexto(empresa?.segmento);

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
    if (!empresaId) return { error: 'empresaId obrigatório' };
    const sb = createSupabaseAdmin();
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
    const sb = createSupabaseAdmin();
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

export async function arquivarTemporada(trilhaId: string) {
  try {
    const sb = createSupabaseAdmin();
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
    const sb = createSupabaseAdmin();
    const { data: trilha } = await sb.from('trilhas')
      .select('id, colaborador_id, empresa_id, competencia_foco, temporada_plano, descritores_selecionados')
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

    if (slot.tipo === 'conteudo' && slot.descritor) {
      const { promptDesafio, parseDesafioResponse } = await import('@/lib/season-engine/prompts/challenge');
      const { system, user } = promptDesafio({
        competencia: trilha.competencia_foco,
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
      const m = promptMissao({ competencia: trilha.competencia_foco, descritores, cargo: colab?.cargo, contexto });
      const c = promptCenario({ competencia: trilha.competencia_foco, descritores, cargo: colab?.cargo, contexto, complexidade });
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
export async function listarTemporadasEmpresa(empresaId: string) {
  try {
    if (!empresaId) return { error: 'empresaId obrigatório' };
    const tdb = tenantDb(empresaId);
    const { data, error } = await tdb.from('trilhas')
      .select('id, colaborador_id, competencia_foco, numero_temporada, status, criado_em, descritores_selecionados, temporada_plano')
      .not('temporada_plano', 'is', null)
      .order('criado_em', { ascending: false });
    if (error) return { error: error.message };

    const ids = (data || []).map((t: any) => t.colaborador_id);
    const { data: colabs } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo').in('id', ids);
    const colabMap = Object.fromEntries((colabs || []).map((c: any) => [c.id, c]));

    return {
      items: (data || []).map((t: any) => ({
        ...t,
        temporada_plano: normalizeTemporadaPlano(t.temporada_plano),
        colab: colabMap[t.colaborador_id] || null,
      })),
    };
  } catch (err: any) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Marca o conteúdo core de uma semana como consumido.
 */
export async function marcarConteudoConsumido(trilhaId: string, semana: number) {
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
    const sb = createSupabaseAdmin();
    const { data: trilha } = await sb.from('trilhas')
      .select('id, colaborador_id, competencia_foco, temporada_plano, evolution_report')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return { error: 'Trilha não encontrada' };

    const { data: progresso } = await sb.from('temporada_semana_progresso')
      .select('*').eq('trilha_id', trilhaId).order('semana');

    const { data: colab } = await sb.from('colaboradores')
      .select('nome_completo, cargo').eq('id', trilha.colaborador_id).maybeSingle();

    return {
      success: true,
      trilha: {
        ...trilha,
        temporada_plano: normalizeTemporadaPlano(trilha.temporada_plano),
      },
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
    if (!colaboradorId) return { error: 'colaboradorId obrigatório' };

    // Descobre empresa_id do colab pra poder usar tenantDb (que força filtro).
    // Uso raw aqui porque colaboradores busca é a fonte do tenantId.
    const sbRaw = createSupabaseAdmin();
    const { data: colaborador } = await sbRaw.from('colaboradores')
      .select('id, nome_completo, cargo, email, perfil_dominante, empresa_id')
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

    return {
      ok: true,
      trilha: {
        ...trilha,
        temporada_plano: normalizeTemporadaPlano(trilha.temporada_plano),
      },
      progresso: progresso || [],
      colaborador,
    };
  } catch (err: any) {
    return { error: err?.message || 'Erro' };
  }
}
