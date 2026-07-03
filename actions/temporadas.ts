'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail } from '@/lib/authz';
import { selectDescriptors, selectDescriptorsMulti, selectDescriptorsDuo, selectDescriptorsPiloto, type AssessmentPorCompetencia } from '@/lib/season-engine/select-descriptors';
import { buildSeason } from '@/lib/season-engine/build-season';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';
import { overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';
import { getProgramaConfig, getProgramaConfigByModo, resolverModoColab, type ProgramaModoLabel } from '@/lib/season-engine/programa-config';
import type { AIConfig } from './ai-client';
import { z } from 'zod';
import { requireAdminAction, requireUserAction, getAuthenticatedEmailFromAction, assertTenantAccessAction } from '@/lib/auth/action-context';
import { protectedAction, DomainError } from '@/lib/auth/protected-action';
import { findTrilhaComTenant, updateTrilhaInTenant, updateSemanaProgressoInTenant } from '@/lib/repositories/trilhas-repo';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { logAdminAction } from '@/lib/audit';
import { PROGRESSO, TRILHA } from '@/lib/status';

interface GerarTemporadaParams {
  colaboradorId?: string;
  competencia?: string;
  aiConfig?: AIConfig;
  /** internal=true: chamado por caminho já gated (ex.: pré-geração do demo) —
   *  usa service_role sem exigir sessão admin. */
  internal?: boolean;
}

/**
 * Wrapper: carrega temporada do colab logado via email.
 */
export async function loadTemporadaPorEmail(email: string, opts: { semanaTranscrito?: number } = {}) {
  try {
    await requireUserAction();
    const colab = await findColabByEmail(email, 'id');
    if (!colab) return { error: 'Colab não encontrado' };
    return loadTemporada(colab.id, opts);
  } catch (err: any) {
    return { error: err?.message || 'Erro' };
  }
}

const GerarTemporadaInput = z.object({
  colaboradorId: z.string().min(1),
  competencia: z.string().optional(),
  aiConfig: z.record(z.string(), z.any()).optional(),
});

const _gerarTemporada = protectedAction('ai.audit.regenerate', GerarTemporadaInput, async (_ctx, input) => {
  const r: any = await gerarTemporadaCore(input);
  // Core devolve shapes legados; erro de domínio vira DomainError (a factory
  // transporta o `codigo` — sem_assessment etc. — pros agregadores).
  if (r?.error) throw new DomainError(r.error, r.codigo);
  return r; // { ok: true, trilhaId, ... } — o wrapper devolve como está
});

/**
 * Wrapper ACHATADOR: callers legados (lote, dispatcher do pipeline, tela
 * admin/temporadas) leem ok/error/codigo no TOPO — o envelope fica interno.
 */
export async function gerarTemporada(input: z.infer<typeof GerarTemporadaInput>) {
  const res = await _gerarTemporada(input);
  return res.success
    ? (res.data as any)
    : { error: res.error, ...(res.codigo ? { codigo: res.codigo } : {}) };
}

/** Geração HEADLESS (pré-geração do demo) — bypassa a sessão admin via internal.
 *  Só usar em caminhos já gated (ex.: seed/reset do acme-demo). */
export async function gerarTemporadaInternal(colaboradorId: string, competencia?: string, aiConfig: AIConfig = {}) {
  return gerarTemporadaCore({ colaboradorId, competencia, aiConfig, internal: true });
}

/**
 * Gera uma temporada pra um colaborador, focada em 1 competência.
 * Duração e cadência vêm de `empresas.sys_config` via `getProgramaConfig`
 * (default = regular 14 semanas). CORE legado — contrato {ok|error,codigo};
 * o export público passa pela factory acima.
 */
async function gerarTemporadaCore({ colaboradorId, competencia, aiConfig, internal }: GerarTemporadaParams = {}) {
  try {
    const sbRaw = internal ? createSupabaseAdmin() : await requireAdminSupabase('ai.audit.regenerate');
    if (!colaboradorId) return { error: 'colaboradorId obrigatório' };

    // Busca raw porque colaboradores é root de tenancy (descobre o tenant aqui).
    const { data: colab } = await sbRaw.from('colaboradores')
      .select('id, nome_completo, cargo, empresa_id, area_depto, programa_modo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso')
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
    // Precedência de GERAÇÃO (fonte única): override do colaborador →
    // default da empresa → DUO. O rótulo resolvido é CARIMBADO na trilha
    // (programa_modo) — o runtime passa a ler de lá, congelando as regras.
    const modoResolvido = resolverModoColab(colab, empresa?.sys_config);
    const programaConfig = getProgramaConfigByModo(modoResolvido);
    const isOnboarding = programaConfig.modo === 'onboarding';

    // ── Modo Onboarding: trilha multi-competência ────────────────────────
    if (isOnboarding) {
      return await gerarTemporadaOnboarding({
        colab, empresa, tdb, sbRaw, contexto, programaConfig, aiConfig, competenciaPrincipal: competenciaAlvo,
      });
    }

    // ── Modo Piloto: degustação 2 semanas, 1 comp, 4 conteúdos ───────────
    if (programaConfig.modo === 'piloto') {
      return await gerarTemporadaPiloto({
        colab, tdb, contexto, programaConfig, aiConfig, competenciaAlvo,
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

    // 7) Persiste trilha + progresso (fonte única dos 4 modos)
    const persist = await persistirTrilha(tdb, {
      colaboradorId,
      competenciaFoco: competenciaAlvo,
      competenciasFoco: [competenciaAlvo], // uniformiza com DUO (Fase 3 lê sempre o array)
      // Fallback DUO→single também aterrissa aqui: o plano gerado É single.
      programaModo: 'regular_single',
      semanas,
      descritoresSelecionados,
    });
    if ('error' in persist) return { error: persist.error };

    return {
      ok: true,
      trilhaId: persist.trilhaId,
      numeroTemporada: persist.numeroTemporada,
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
  const persist = await persistirTrilha(tdb, {
    colaboradorId: colab.id,
    competenciaFoco: competencias[0],
    competenciasFoco: competencias,
    programaModo: 'onboarding',
    semanas,
    descritoresSelecionados,
  });
  if ('error' in persist) return { error: persist.error };
  const { trilhaId, numeroTemporada } = persist;

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
  const persist = await persistirTrilha(tdb, {
    colaboradorId: colab.id,
    competenciaFoco: comps[0],
    competenciasFoco: comps,
    programaModo: 'regular_duo',
    semanas,
    descritoresSelecionados,
  });
  if ('error' in persist) return { error: persist.error };
  const { trilhaId, numeroTemporada } = persist;

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

/**
 * Modo Piloto: degustação de 2 semanas focada em RODAR O FLUXO INTEIRO
 * (diagnóstico → conteúdo → fechamento com cenário + avaliação IA), não em
 * demonstrar evolução. 1 competência (resolução de âncora EXISTENTE:
 * competência explícita → trilha → cargo), top-4 descritores por gap
 * (selectDescriptorsPiloto), 2 conteúdos/semana resolvidos pela via atual
 * (formato-core preferência×taxa + opcionais), slot 3 = fechamento.
 *
 * Verify by presence: se o assessment não sustenta 4 descritores distintos,
 * erro EXPLÍCITO com a contagem — nunca slot vazio silencioso.
 */
async function gerarTemporadaPiloto(args: {
  colab: any; tdb: any; contexto: string;
  programaConfig: any; aiConfig?: AIConfig; competenciaAlvo: string;
}) {
  const { colab, tdb, contexto, programaConfig, aiConfig, competenciaAlvo } = args;

  // 1) Assessment da competência âncora (anti-viés: sem default 1.5)
  const { data: assessment } = await tdb.from('descriptor_assessments')
    .select('descritor, nota')
    .eq('colaborador_id', colab.id)
    .eq('competencia', competenciaAlvo);
  if (!assessment || assessment.length === 0) {
    return {
      error: `Colaborador ainda não tem avaliação (descriptor_assessments) para "${competenciaAlvo}". Rode a rodada de mapeamento antes de gerar o piloto.`,
      codigo: 'sem_assessment',
    };
  }

  // 2) Top-4 descritores por gap, 2 por semana, exatamente 4 distintos
  const esperado = (programaConfig.slotsConteudo?.length || 2) * (programaConfig.conteudosPorSemana || 2);
  const descritoresSelecionados = selectDescriptorsPiloto(
    competenciaAlvo, assessment, programaConfig.slotsConteudo, programaConfig.conteudosPorSemana,
  );
  if (descritoresSelecionados.length < esperado) {
    return {
      error: `Piloto precisa de ${esperado} descritores avaliados distintos em "${competenciaAlvo}" — o colaborador tem ${descritoresSelecionados.length} (${descritoresSelecionados.map(d => d.descritor).join(', ') || 'nenhum'}). Complete o mapeamento ou cadastre mais descritores.`,
      codigo: 'piloto_descritores_insuficientes',
    };
  }

  // 3) Plano: sems 1-2 com 2 entregas cada (via existente) + slot 3 fechamento
  const prioridadeFormatos = derivarPrioridadeFormatos(colab);
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

  // 4) Persiste (UPDATE se existir, INSERT senão) — idêntico aos demais modos
  const persist = await persistirTrilha(tdb, {
    colaboradorId: colab.id,
    competenciaFoco: competenciaAlvo,
    competenciasFoco: [competenciaAlvo],
    programaModo: 'piloto',
    semanas,
    descritoresSelecionados,
  });
  if ('error' in persist) return { error: persist.error };
  const { trilhaId, numeroTemporada } = persist;

  return {
    ok: true,
    trilhaId,
    numeroTemporada,
    competencia: competenciaAlvo,
    descritores: descritoresSelecionados.length,
    semanas: semanas.length,
    modo: 'piloto',
  };
}

/**
 * Check de PRONTIDÃO do Piloto (admin, antes de liberar): pra cada colaborador,
 * resolve a competência âncora + top-4 descritores e verifica POR PRESENÇA:
 *   - CORE (bloqueador): descritor sem NENHUM micro-conteúdo utilizável
 *     (nem match direto do descritor, nem pool da competência) → a semana
 *     nasceria com fallback templated. Sinalizado como bloqueador.
 *   - Match direto ausente (aviso): usa pool da competência — degrada, ok.
 *   - Formatos opcionais faltando: ok, o switch degrada.
 *   - Cenário B (bloqueador do fechamento): sem banco_cenarios tipo
 *     'cenario_b' pro cargo → fechamento retornaria 424. Gerar via Fase 5.
 */
const ProntidaoInput = z.object({ empresaId: z.string().min(1) });

const _verificarProntidaoPiloto = protectedAction('admin.access', ProntidaoInput, async (ctx, { empresaId }) => {
    await assertTenantAccessAction(ctx, empresaId);
    const sbRaw = await requireAdminSupabase();

    const { data: empresa } = await sbRaw.from('empresas')
      .select('sys_config').eq('id', empresaId).maybeSingle();

    const tdb = tenantDb(empresaId);
    const { data: todosColabs } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, programa_modo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso');
    if (!todosColabs?.length) throw new Error('Sem colaboradores');

    // O modo é por COLABORADOR (override) com default da empresa — o check
    // cobre só quem RESOLVERIA pra piloto na geração (fonte única de precedência).
    const colabs = (todosColabs as any[]).filter(
      c => resolverModoColab(c, empresa?.sys_config) === 'piloto',
    );
    if (!colabs.length) {
      throw new Error(`Nenhum colaborador resolveria pra piloto (default da empresa: ${empresa?.sys_config?.programa_modo || 'regular DUO'}; nenhum override individual 'piloto'). Marque colaboradores em Configurações → Equipe ou mude o default do Programa.`);
    }
    const programaConfig = getProgramaConfigByModo('piloto');

    // Cenários B disponíveis por cargo (fechamento)
    const { data: cenariosB } = await tdb.from('banco_cenarios')
      .select('cargo').eq('tipo_cenario', 'cenario_b');
    const cargosComCenarioB = new Set((cenariosB || []).map((c: any) => c.cargo));

    const esperado = (programaConfig.slotsConteudo?.length || 2) * (programaConfig.conteudosPorSemana || 2);
    const resultados: any[] = [];
    const conteudoCache: Record<string, any[]> = {};

    // Batch (era 2 queries POR colaborador): trilhas mais recentes + cargos
    const colabIds = colabs.map((c: any) => c.id);
    const { data: trilhasTodas } = await tdb.from('trilhas')
      .select('colaborador_id, competencia_foco, criado_em')
      .in('colaborador_id', colabIds)
      .order('criado_em', { ascending: false });
    const compPorColab = new Map<string, string>();
    for (const t of (trilhasTodas || []) as any[]) {
      if (!compPorColab.has(t.colaborador_id) && t.competencia_foco) compPorColab.set(t.colaborador_id, t.competencia_foco);
    }
    const cargosNomes = [...new Set(colabs.map((c: any) => c.cargo).filter(Boolean))];
    const { data: cargosRows } = cargosNomes.length
      ? await tdb.from('cargos_empresa').select('nome, competencia_foco').in('nome', cargosNomes)
      : { data: [] as any[] };
    const compPorCargo = new Map<string, string>((cargosRows || []).map((c: any) => [c.nome, c.competencia_foco]));

    for (const colab of colabs as any[]) {
      // Competência âncora — MESMA resolução da geração (trilha → cargo)
      const comp: string | undefined = compPorColab.get(colab.id) || (colab.cargo ? compPorCargo.get(colab.cargo) : undefined);
      if (!comp) {
        resultados.push({ colaborador: colab.nome_completo, pronto: false, bloqueadores: ['Sem competência foco resolvível (trilha/cargo)'] });
        continue;
      }

      const { data: assessment } = await tdb.from('descriptor_assessments')
        .select('descritor, nota').eq('colaborador_id', colab.id).eq('competencia', comp);
      const top = selectDescriptorsPiloto(comp, assessment || [], programaConfig.slotsConteudo, programaConfig.conteudosPorSemana);

      const bloqueadores: string[] = [];
      const avisos: string[] = [];
      if (top.length < esperado) {
        bloqueadores.push(`Só ${top.length}/${esperado} descritores avaliados distintos em "${comp}" — complete o mapeamento`);
      }

      // Conteúdos da competência (empresa OU global), 1 query por competência
      if (!conteudoCache[comp]) {
        const { data: conteudos } = await sbRaw.from('micro_conteudos')
          .select('descritor, formato')
          .eq('ativo', true).eq('competencia', comp)
          .or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
        conteudoCache[comp] = conteudos || [];
      }
      const pool = conteudoCache[comp];
      const formatosPool = new Set(pool.map((c: any) => c.formato));

      for (const d of top) {
        const doDescritor = pool.filter((c: any) => c.descritor === d.descritor);
        if (doDescritor.length === 0 && pool.length === 0) {
          bloqueadores.push(`"${d.descritor}": SEM formato-core (nenhum conteúdo da competência) — semana nasceria com fallback`);
        } else if (doDescritor.length === 0) {
          avisos.push(`"${d.descritor}": sem conteúdo próprio — reusa pool da competência (${[...formatosPool].join(', ')})`);
        } else {
          const formatosDesc = new Set(doDescritor.map((c: any) => c.formato));
          const faltando = ['video', 'texto', 'audio', 'case'].filter(f => !formatosDesc.has(f));
          if (faltando.length) avisos.push(`"${d.descritor}": opcionais faltando no switch (${faltando.join(', ')}) — ok, degrada`);
        }
      }

      // Fechamento: cenário B do cargo (a rota busca cargo do colab || 'todos')
      if (!cargosComCenarioB.has(colab.cargo || 'todos') && !cargosComCenarioB.has('todos')) {
        bloqueadores.push(`Fechamento sem Cenário B pro cargo "${colab.cargo || 'todos'}" — gere na Fase 5 (Cenários B em lote)`);
      }

      resultados.push({
        colaborador: colab.nome_completo,
        cargo: colab.cargo,
        competencia: comp,
        descritores: top.map(d => d.descritor),
        pronto: bloqueadores.length === 0,
        bloqueadores,
        avisos,
      });
    }

    const prontos = resultados.filter(r => r.pronto).length;
    return { total: resultados.length, prontos, resultados };
});
export async function verificarProntidaoPiloto(input: z.infer<typeof ProntidaoInput>) {
  return _verificarProntidaoPiloto(input);
}

/**
 * Persistência de trilha + progresso — FONTE ÚNICA dos 4 modos (single, DUO,
 * onboarding, piloto), que mantinham 4 cópias byte-quase-idênticas deste
 * bloco. Regras preservadas: 1 trilha por (empresa, colab) → UPDATE se
 * existe (numero_temporada mantido); semana 1 nasce em_andamento; progresso
 * é recriado do zero (delete+insert).
 */
async function persistirTrilha(tdb: any, args: {
  colaboradorId: string;
  competenciaFoco: string;
  competenciasFoco: string[];
  programaModo: ProgramaModoLabel;
  semanas: any[];
  descritoresSelecionados: any[];
}): Promise<{ trilhaId: string; numeroTemporada: number } | { error: string }> {
  const { colaboradorId, competenciaFoco, competenciasFoco, programaModo, semanas, descritoresSelecionados } = args;

  const { data: existente } = await tdb.from('trilhas')
    .select('id, numero_temporada')
    .eq('colaborador_id', colaboradorId)
    .order('criado_em', { ascending: false }).limit(1).maybeSingle();

  // Com UPDATE na mesma row, regenerar não infla o contador.
  const numeroTemporada = existente?.numero_temporada || 1;
  const { nextMondayISO } = await import('@/lib/season-engine/week-gating');
  // empresa_id é injetado pelo tdb.insert/update — não precisa repetir aqui.
  const payload = {
    colaborador_id: colaboradorId,
    competencia_foco: competenciaFoco,          // compat — âncora
    competencias_foco: competenciasFoco,        // array (migration 091)
    numero_temporada: numeroTemporada,
    temporada_plano: semanas,
    descritores_selecionados: descritoresSelecionados,
    programa_modo: programaModo,                // carimbo do runtime (mig 154)
    status: TRILHA.ATIVA,
    data_inicio: nextMondayISO(),               // sem 1 libera na próxima segunda 03:00 BRT
    cursos: [],                                 // legado — conteúdo vive em temporada_plano
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

  const progressos = semanas.map((sem: any) => ({
    trilha_id: trilhaId,
    colaborador_id: colaboradorId,
    semana: sem.semana,
    tipo: sem.tipo,
    status: sem.semana === 1 ? PROGRESSO.EM_ANDAMENTO : PROGRESSO.PENDENTE,
  }));
  await tdb.from('temporada_semana_progresso').delete().eq('trilha_id', trilhaId);
  await tdb.from('temporada_semana_progresso').insert(progressos);

  return { trilhaId, numeroTemporada };
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
const GerarLoteInput = z.object({
  empresaId: z.string().min(1),
  aiConfig: z.record(z.string(), z.any()).optional(),
});

const _gerarTemporadasLote = protectedAction('ai.audit.regenerate', GerarLoteInput, async (ctx, { empresaId, aiConfig }) => {
  await assertTenantAccessAction(ctx, empresaId);
  const sb = await requireAdminSupabase();
  const { data: colabs } = await sb.from('colaboradores')
    .select('id, nome_completo').eq('empresa_id', empresaId);
  if (!colabs?.length) throw new Error('Sem colaboradores');

  const resultados: any[] = [];
  for (const c of colabs) {
    const r = await gerarTemporada({ colaboradorId: c.id, aiConfig });
    resultados.push({ colab: c.nome_completo, ...r });
  }
  const ok = resultados.filter(r => r.ok).length;
  const errosUnicos = [...new Set(resultados.filter(r => !r.ok).map(r => r.error))].slice(0, 3);
  await logAdminAction({
    adminEmail: ctx.email || 'desconhecido',
    acao: 'temporada.gerar_lote', empresaId,
    alvo: `${colabs.length} colaboradores`,
    detalhes: { total: colabs.length, gerados: ok, erros: colabs.length - ok, errosUnicos },
    resultado: ok === 0 ? 'erro' : ok < colabs.length ? 'parcial' : 'ok',
  });
  return {
    total: colabs.length,
    gerados: ok,
    resultados,
    message: `${ok}/${colabs.length} temporadas geradas${errosUnicos.length ? ` · erros: ${errosUnicos.join('; ')}` : ''}`,
  };
});
/**
 * Wrapper POSICIONAL achatador: o dispatcher genérico do pipeline
 * (ACTION_MAP) e actions/fase4.ts chamam `(empresaId, aiConfig)` e leem
 * success/message no TOPO — o envelope do protectedAction fica interno.
 */
export async function gerarTemporadasLote(empresaId: string, aiConfig?: AIConfig) {
  const r = await _gerarTemporadasLote({ empresaId, aiConfig });
  return r.success ? { success: true, ...(r.data as object) } : r;
}

/**
 * Pausa/retoma uma temporada (toggle baseado no status atual).
 */
const TrilhaIdInput = z.object({ trilhaId: z.string().min(1) });

const _pausarRetomarTemporada = protectedAction('content.manage', TrilhaIdInput, async (ctx, { trilhaId }) => {
  const sb = await requireAdminSupabase();
  const trilha = await findTrilhaComTenant(sb, trilhaId);
  if (!trilha) throw new Error('Trilha não encontrada');
  await assertTenantAccessAction(ctx, trilha.empresa_id); // defense-in-depth (no-op p/ platform admin)
  const novo = trilha.status === TRILHA.PAUSADA ? TRILHA.ATIVA : TRILHA.PAUSADA;
  const upd = await updateTrilhaInTenant(sb, trilha.empresa_id, trilhaId, { status: novo });
  if (!upd) throw new Error('Trilha não encontrada nesta empresa');
  return { status: novo, message: `Temporada ${novo}` };
});
export async function pausarRetomarTemporada(input: z.infer<typeof TrilhaIdInput>) {
  return _pausarRetomarTemporada(input);
}

/**
 * Antecipa o início da temporada para liberar as semanas IMEDIATAMENTE (teste/demo).
 * Seta data_inicio para a segunda-feira corrente (SP) — semana 1 libera na hora e as
 * seguintes mantêm o ritmo de 7 dias. Em produção, data_inicio nasce na próxima segunda.
 */
const _anteciparInicioTemporada = protectedAction('content.manage', TrilhaIdInput, async (ctx, { trilhaId }) => {
  const sb = await requireAdminSupabase();
  // Segunda-feira corrente em SP (BRT, UTC-3): a segunda <= hoje.
  const SP_OFFSET_H = 3;
  const sp = new Date(Date.now() - SP_OFFSET_H * 3600 * 1000);
  const dow = sp.getUTCDay(); // 0=dom..6=sab
  const diasDesdeSegunda = (dow + 6) % 7; // seg=0, ter=1, ..., dom=6
  const segunda = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() - diasDesdeSegunda));
  const dataInicio = segunda.toISOString().slice(0, 10);
  const trilha = await findTrilhaComTenant(sb, trilhaId);
  if (!trilha) throw new Error('Trilha não encontrada');
  await assertTenantAccessAction(ctx, trilha.empresa_id);
  const upd = await updateTrilhaInTenant(sb, trilha.empresa_id, trilhaId, { data_inicio: dataInicio });
  if (!upd) throw new Error('Trilha não encontrada nesta empresa');
  return { dataInicio, message: `Semanas liberadas (início ${dataInicio})` };
});
export async function anteciparInicioTemporada(input: z.infer<typeof TrilhaIdInput>) {
  return _anteciparInicioTemporada(input);
}

const _arquivarTemporada = protectedAction('content.manage', TrilhaIdInput, async (ctx, { trilhaId }) => {
  const sb = await requireAdminSupabase();
  const trilha = await findTrilhaComTenant(sb, trilhaId);
  if (!trilha) throw new Error('Trilha não encontrada');
  await assertTenantAccessAction(ctx, trilha.empresa_id);
  const upd = await updateTrilhaInTenant(sb, trilha.empresa_id, trilhaId, { status: TRILHA.ARQUIVADA });
  if (!upd) throw new Error('Trilha não encontrada nesta empresa');
  return { message: 'Arquivada' };
});
export async function arquivarTemporada(input: z.infer<typeof TrilhaIdInput>) {
  return _arquivarTemporada(input);
}

/**
 * Regera desafio (semana de conteúdo) OU cenário (semana de aplicação)
 * para uma semana específica. Reseta o progresso.
 */
const RegerarSemanaInput = z.object({
  trilhaId: z.string().min(1),
  semana: z.coerce.number().int().min(1),
  aiConfig: z.record(z.string(), z.any()).optional(),
});

const _regerarSemana = protectedAction('ai.audit.regenerate', RegerarSemanaInput, async (ctx, { trilhaId, semana, aiConfig = {} }) => {
    const sb = await requireAdminSupabase();
    const trilha = await findTrilhaComTenant(
      sb, trilhaId,
      'id, colaborador_id, empresa_id, competencia_foco, competencias_foco, temporada_plano, descritores_selecionados',
    );
    if (!trilha) throw new Error('Trilha não encontrada');
    await assertTenantAccessAction(ctx, trilha.empresa_id);

    const plano: any[] = Array.isArray(trilha.temporada_plano) ? [...trilha.temporada_plano] : [];
    const idx = plano.findIndex((s: any) => s.semana === Number(semana));
    if (idx < 0) throw new Error('Semana não encontrada no plano');

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
      throw new Error('Semana de avaliação não pode ser regerada');
    }

    await updateTrilhaInTenant(sb, trilha.empresa_id, trilhaId, { temporada_plano: plano });

    // Reseta progresso da semana
    await updateSemanaProgressoInTenant(sb, trilha.empresa_id, trilhaId, Number(semana), {
      status: PROGRESSO.PENDENTE, conteudo_consumido: false, reflexao: null, feedback: null, iniciado_em: null, concluido_em: null,
    });

    return { message: `Semana ${semana} regerada` };
});
export async function regerarSemana(input: z.infer<typeof RegerarSemanaInput>) {
  return _regerarSemana(input);
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
    // Pré-carrega TODOS os kits da trilha em 3 queries (antes: 2-3 queries POR
    // semana = ~30 numa trilha de 14 sem). Consultado em memória no overlay.
    const { precarregarKits } = await import('@/lib/season-engine/kit/entrega-semana');
    const kitsCache = await precarregarKits(sb, { empresaId: colab.empresa_id, disc, cargo: colab.cargo }).catch(() => undefined);
    await Promise.all(
      plano.filter((s: any) => s?.tipo === 'conteudo').map((s: any) =>
        overlayKitNaSemana(sb, s, { empresaId: colab.empresa_id, disc, cargo: colab.cargo, formatoPref, competenciaFoco, kitsCache }),
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
const PrepararEntregasInput = z.object({
  empresaId: z.string().min(1),
  colaboradorId: z.string().optional(),
});

const _prepararEntregasJornada = protectedAction('content.manage', PrepararEntregasInput, async (ctx, { empresaId, colaboradorId }) => {
  await assertTenantAccessAction(ctx, empresaId);
  const opts = { colaboradorId };
  const { gerarConteudoFinalPersonalizado, prepararAudioPersonalizado } = await import('@/actions/conteudos');
  const { semanaLiberadaPorData } = await import('@/lib/season-engine/week-gating');
  const tdb = tenantDb(empresaId);

  const colCols = 'id, nome_completo, cargo, empresa_id, perfil_dominante, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso';
  let cq = tdb.from('colaboradores').select(colCols);
  if (opts.colaboradorId) cq = cq.eq('id', opts.colaboradorId);
  const { data: colabs } = await cq;
  if (!colabs?.length) throw new Error('Sem colaboradores');

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
      if (!semanaLiberadaPorData(trilha.data_inicio, s.calendario_semana ?? s.semana)) continue; // só liberadas (espelho do piloto respeitado)
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
  return { colaboradores: colabs.length, semanas, preparadas, jaProntas, falhas };
});
export async function prepararEntregasJornada(input: z.infer<typeof PrepararEntregasInput>) {
  return _prepararEntregasJornada(input);
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
    const { data: t } = await sb.from('trilhas').select('empresa_id, colaborador_id, temporada_plano').eq('id', trilhaId).maybeSingle();
    if (!t) return { error: 'Trilha não encontrada' };
    const { data: existente } = await sb.from('temporada_semana_progresso')
      .select('id, iniciado_em').eq('trilha_id', trilhaId).eq('semana', semana).maybeSingle();
    const payload = {
      conteudo_consumido: true,
      status: PROGRESSO.EM_ANDAMENTO,
      iniciado_em: existente?.iniciado_em || new Date().toISOString(),
    };
    if (existente) {
      await sb.from('temporada_semana_progresso').update(payload).eq('id', existente.id).eq('empresa_id', t.empresa_id);
    } else {
      const tipo = (t.temporada_plano || []).find((s: any) => s.semana === semana)?.tipo || 'conteudo';
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
export async function loadTemporada(colaboradorId: string, opts: { semanaTranscrito?: number } = {}) {
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

    // Progresso LEVE: sem os 3 JSONB de transcript (reflexao/feedback/tira_duvidas),
    // que pesam e só são usados na tela de UMA semana. Antes `select('*')` puxava os
    // 14 transcripts por load.
    const COLS_LEVE = 'id, trilha_id, empresa_id, colaborador_id, semana, tipo, status, conteudo_consumido, iniciado_em, concluido_em';
    const { data: progresso } = await tdb.from('temporada_semana_progresso')
      .select(COLS_LEVE).eq('trilha_id', trilha.id).order('semana');

    // Transcritos só da semana em FOCO (tela [week]/sem14) → 1 linha, não 14.
    if (opts.semanaTranscrito && progresso?.length) {
      const { data: tr } = await tdb.from('temporada_semana_progresso')
        .select('semana, reflexao, feedback, tira_duvidas')
        .eq('trilha_id', trilha.id).eq('semana', opts.semanaTranscrito).maybeSingle();
      const alvo = tr && progresso.find((p: any) => p.semana === opts.semanaTranscrito);
      if (alvo) Object.assign(alvo, { reflexao: tr.reflexao, feedback: tr.feedback, tira_duvidas: tr.tira_duvidas });
    }

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
