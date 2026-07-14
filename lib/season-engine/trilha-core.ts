import { tenantDb } from '@/lib/tenant-db';
import { selectDescriptors, selectDescriptorsMulti, selectDescriptorsDuo, selectDescriptorsPiloto, type AssessmentPorCompetencia } from '@/lib/season-engine/select-descriptors';
import { buildSeason } from '@/lib/season-engine/build-season';
import { blueprintToTrilhaInputs, type BlueprintTrilhaInputs } from '@/lib/blueprint/to-descriptors';
import { focoDoCargo } from '@/lib/foco-cargo';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { getProgramaConfigByModo, resolverModoColab, type ProgramaModoLabel } from '@/lib/season-engine/programa-config';
import type { AIConfig } from '@/actions/ai-client';
import { PROGRESSO, TRILHA } from '@/lib/status';

/**
 * Gera uma temporada pra um colaborador, focada em 1 competência.
 * Duração e cadência vêm de `empresas.sys_config` via `getProgramaConfig`
 * (default = regular 14 semanas). CORE legado — contrato {ok|error,codigo};
 * o export público (`actions/temporadas.ts`) aplica o gate e delega aqui.
 *
 * Núcleo SEM gate de sessão (o client admin `sbRaw` vem por parâmetro): pode
 * ser chamado HEADLESS (seed/reset de demo, task Trigger, cron), como
 * `lib/blueprint/core.ts`. Quando `empresaIdEsperado` é informado (caminho de
 * lote), o núcleo revalida o tenant do colaborador.
 */
export async function gerarTemporadaCoreHeadless(sbRaw: any, { colaboradorId, competencia, aiConfig, empresaIdEsperado }: { colaboradorId?: string; competencia?: string; aiConfig?: any; empresaIdEsperado?: string } = {}) {
  try {
    if (!colaboradorId) return { error: 'colaboradorId obrigatório' };

    // Busca raw porque colaboradores é root de tenancy (descobre o tenant aqui).
    const { data: colab } = await sbRaw.from('colaboradores')
      .select('id, nome_completo, cargo, empresa_id, area_depto, programa_modo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso')
      .eq('id', colaboradorId).maybeSingle();
    if (!colab) return { error: 'Colaborador não encontrado' };
    if (empresaIdEsperado && colab.empresa_id !== empresaIdEsperado) return { error: 'Colaborador de outro tenant — acesso negado' };

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
export async function gerarTemporadaOnboarding(args: {
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
export async function gerarTemporadaRegularDuo(args: {
  colab: any; empresa: any; tdb: any; sbRaw: any; contexto: string;
  programaConfig: any; aiConfig?: AIConfig; competenciaAncora?: string;
}): Promise<any> {
  const { colab, empresa, tdb, contexto, programaConfig, aiConfig, competenciaAncora } = args;

  // 1) Resolve 2 competências — prioridade (item D): FOCO do cargo (fonte única
  // com o PDI, mig 174) → sys_config override → top-2 do top10 (âncora primeiro).
  const { data: cargoFocoRow } = await tdb.from('cargos_empresa')
    .select('competencia_foco, competencias_foco').eq('nome', colab.cargo || '').maybeSingle();
  let comps: string[] = focoDoCargo(cargoFocoRow).slice(0, 2);
  if (comps.length < 2 && Array.isArray(empresa?.sys_config?.competencias_regular_duo)) {
    comps = empresa.sys_config.competencias_regular_duo.slice(0, 2);
  }
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

  // 3) Seleção de descritores. Estágio 3 (Fase 1): atrás da flag
  // BLUEPRINT_DRIVES_TRILHA, a trilha CONSOME o Development Blueprint —
  // semanas/descritores/binding-do-PDI vêm de `blueprint.trilha.semanas` (fonte
  // única com o PDI) em vez de `selectDescriptorsDuo`. Sem blueprint OU adapter
  // não-aproveitável OU flag off → fallback pro caminho paralelo atual (byte-igual).
  let blueprintInputs: BlueprintTrilhaInputs | null = null;
  // Flag: env global (todos os tenants) OU por empresa (sys_config, p/ piloto).
  const blueprintDrivesTrilha = process.env.BLUEPRINT_DRIVES_TRILHA === '1'
    || empresa?.sys_config?.blueprint_drives_trilha === true;
  if (blueprintDrivesTrilha) {
    const { data: bpRow } = await tdb.from('development_blueprints')
      .select('blueprint')
      .eq('colaborador_id', colab.id)
      .order('gerado_em', { ascending: false })
      .limit(1).maybeSingle();
    if (bpRow?.blueprint) {
      const r = blueprintToTrilhaInputs(bpRow.blueprint, assessmentPorComp, programaConfig);
      if ('error' in r) {
        console.warn(`[DUO] blueprint→trilha indisponível (${r.error}) — fallback selectDescriptorsDuo`);
      } else {
        blueprintInputs = r;
        if (r.avisos.length) console.warn(`[DUO] blueprint→trilha avisos:`, r.avisos);
      }
    }
  }

  const descritoresSelecionados = blueprintInputs
    ? blueprintInputs.descritoresSelecionados
    : selectDescriptorsDuo(
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
    blueprintBinding: blueprintInputs?.bindingPorSemana,
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
export async function gerarTemporadaPiloto(args: {
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
 * Persistência de trilha + progresso — FONTE ÚNICA dos 4 modos (single, DUO,
 * onboarding, piloto), que mantinham 4 cópias byte-quase-idênticas deste
 * bloco. Regras preservadas: 1 trilha por (empresa, colab) → UPDATE se
 * existe (numero_temporada mantido); semana 1 nasce em_andamento; progresso
 * é recriado do zero (delete+insert).
 */
export async function persistirTrilha(tdb: any, args: {
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

export function inferirContexto(segmento?: string | null): string {
  if (!segmento) return 'generico';
  const s = String(segmento).toLowerCase();
  if (s.includes('educa') || s.includes('escola')) return 'educacional';
  if (s.includes('saude') || s.includes('saúde')) return 'corporativo';
  return 'corporativo';
}
