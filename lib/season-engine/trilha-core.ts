import { tenantDb } from '@/lib/tenant-db';
import { selectDescriptors, selectDescriptorsMulti, selectDescriptorsDuo, selectDescriptorsPiloto, type AssessmentPorCompetencia } from '@/lib/season-engine/select-descriptors';
import { buildSeason } from '@/lib/season-engine/build-season';
import { blueprintToTrilhaInputs, type BlueprintTrilhaInputs } from '@/lib/blueprint/to-descriptors';
import { focoDoCargo } from '@/lib/foco-cargo';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { getProgramaConfigByModo, type ProgramaConfig, type ProgramaModoLabel, type SequenciaPersonalizado } from '@/lib/season-engine/programa-config';
import { carregarContextoTurma, resolverModoDaTurma } from '@/lib/turmas';
import { parseProgramaCustom, derivarConfigCustom, parseConfigSnapshot, parseSequenciaPersonalizado } from '@/lib/season-engine/programa-custom';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import type { AIConfig } from '@/actions/ai-client';
import { PROGRESSO, TRILHA } from '@/lib/status';
import { consumiuConteudo } from '@/lib/season-engine/consumo-conteudo';
import { travaRegeracao } from '@/lib/season-engine/trava-regeracao';

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
/**
 * Contexto de TURMA para a geração (mig 210). Resolvido uma vez em
 * `gerarTemporadaCoreHeadless` e propagado para todos os modos: o carimbo da
 * participação, o calendário da safra e a config efetiva (empresa → turma →
 * participação) andam juntos, senão um modo herda a config da turma e grava a
 * trilha sem carimbo — ou o contrário.
 */
export interface ContextoGeracaoTurma {
  turmaMembroId: string | null;
  dataInicioTurma: string | null;
  /** Config EFETIVA. Sem turma, é a `sys_config` da empresa inalterada. */
  config: Record<string, any>;
}

export async function gerarTemporadaCoreHeadless(sbRaw: any, { colaboradorId, competencia, aiConfig, empresaIdEsperado, novaJornada, configPersonalizado }: {
  colaboradorId?: string; competencia?: string; aiConfig?: any; empresaIdEsperado?: string; novaJornada?: boolean;
  /**
   * Encadeamento do Personalizado (03/10/2026): a config da PRÓXIMA competência,
   * vinda do snapshot da trilha que concluiu (`configDaProximaCompetencia`).
   * Presente, a geração é Personalizado com essas regras, seja qual for o modo
   * da empresa hoje: o programa está em andamento. Só caminho headless passa
   * isto; a action `gerarTemporada` valida a entrada e não o aceita.
   */
  configPersonalizado?: ProgramaConfig;
} = {}) {
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
      // A MESMA régua de PDI e blueprint (`focoDoCargo`, o array antes da coluna
      // simples), R-85: lendo só `competencia_foco` a trilha da Jornada podia seguir
      // uma competência e o PDI da mesma pessoa outra.
      const { data: cargoEmp, error: errCargoFoco } = await tdb.from('cargos_empresa')
        .select('competencia_foco, competencias_foco')
        .eq('nome', colab.cargo)
        .maybeSingle();
      if (errCargoFoco) return { error: `Falha ao ler o foco do cargo: ${errCargoFoco.message}` };
      competenciaAlvo = focoDoCargo(cargoEmp)[0];
    }
    if (!competenciaAlvo) return { error: 'Sem competência foco definida pra este colaborador' };

    // 2) Descobre contexto/setor da empresa + sys_config.
    // empresas não tem coluna empresa_id (o id DELA é o tenant) → usa raw.
    const { data: empresa } = await sbRaw.from('empresas')
      .select('segmento, sys_config').eq('id', colab.empresa_id).maybeSingle();
    const contexto = inferirContexto(empresa?.segmento);

    // Contexto de TURMA (mig 210): resolve UMA vez a participação ativa, o
    // calendário da safra e a config efetiva — e propaga para todos os modos.
    const ctxTurma = await carregarContextoTurma(sbRaw, colab.empresa_id, colab.id, empresa?.sys_config || {});
    const cfg = ctxTurma.config;
    const turma: ContextoGeracaoTurma = {
      turmaMembroId: ctxTurma.turmaMembroId,
      dataInicioTurma: ctxTurma.turmaDataInicio,
      config: cfg,
    };

    // Precedência de GERAÇÃO (fonte única): participação → turma → override do
    // colaborador (legado) → default da empresa → Jornada (padrão desde
    // 03/10/2026, `PROGRAMA_MODO_PADRAO`). O rótulo resolvido é
    // CARIMBADO na trilha (programa_modo) — o runtime passa a ler de lá,
    // congelando as regras. Sem turma, `cfg` é a sys_config da empresa e o
    // resultado é byte-igual ao `resolverModoColab` anterior.
    const modoResolvido = (configPersonalizado
      ? 'custom'
      : resolverModoDaTurma({ empresa: cfg, colaboradorLegado: colab })) as ProgramaModoLabel;

    // Trava de regeração ANTES de qualquer IA (lib/season-engine/trava-regeracao.ts):
    // regerar não reabre trilha concluída, não apaga snapshot de plano próprio e
    // não troca o formato de quem está no meio. `persistirTrilha` relê e trava de
    // novo antes de gravar (a trilha pode concluir enquanto a IA gera o plano).
    const { data: trilhaAtual, error: errTrilhaAtual } = await tdb.from('trilhas')
      .select('status, programa_modo, programa_config, turma_membro_id')
      .eq('colaborador_id', colaboradorId)
      .order('numero_temporada', { ascending: false }).limit(1).maybeSingle();
    if (errTrilhaAtual) return { error: `Falha ao ler a trilha atual: ${errTrilhaAtual.message}` };
    const trava = travaRegeracao(trilhaAtual, { modoNovo: modoResolvido, novaJornada, turmaMembroId: ctxTurma.turmaMembroId });
    if (trava) return { error: trava.mensagem, codigo: trava.codigo };

    let programaConfig: ProgramaConfig = getProgramaConfigByModo(modoResolvido);
    // Personalizado: o snapshot que vai para `trilhas.programa_config` (mig 182)
    // e as competências do programa (1 ou 2, em sequência).
    let snapshotConfig: ProgramaConfig | undefined;
    let competenciasDoPrograma: string[] | undefined;

    // ── Personalizado (03/10/2026): uma Jornada de duração ajustável ──────
    // A config vem de DADO (sys_config.programa_custom; no encadeamento, o
    // snapshot da trilha que concluiu) e a trilha segue o MESMO caminho da
    // Jornada logo abaixo: uma competência por trilha, seleção por lacuna
    // (blueprint ou `selectDescriptors`), carimbo 'custom' + snapshot. Antes
    // ele herdava a maquinaria do piloto (trava de piso, sem certificado) e
    // exigia um descritor distinto por pílula.
    if (modoResolvido === 'custom') {
      // Regerar a MESMA linha preserva a posição dela no programa: regerar a
      // 2ª competência não pode transformá-la na 1ª de uma sequência nova.
      const linhaNova = !!novaJornada
        || (!!ctxTurma.turmaMembroId && !!trilhaAtual?.turma_membro_id && trilhaAtual.turma_membro_id !== ctxTurma.turmaMembroId);
      const sequenciaExistente = !linhaNova && trilhaAtual?.programa_modo === 'custom'
        ? parseSequenciaPersonalizado(parseConfigSnapshot(trilhaAtual.programa_config)?.sequenciaPersonalizado)
        : null;
      const plano = await planejarTrilhaPersonalizada({
        tdb, colab, cfg, competenciaAlvo, configCongelada: configPersonalizado, sequenciaExistente,
      });
      if ('error' in plano) return plano;
      programaConfig = plano.config;
      snapshotConfig = plano.config;
      competenciaAlvo = plano.competencia;
      competenciasDoPrograma = plano.competencias;
    }

    const isOnboarding = modoResolvido !== 'custom' && programaConfig.modo === 'onboarding';

    // ── Modo Onboarding: trilha multi-competência ────────────────────────
    if (isOnboarding) {
      return await gerarTemporadaOnboarding({
        colab, empresa, tdb, sbRaw, contexto, programaConfig, aiConfig, competenciaPrincipal: competenciaAlvo, turma,
      });
    }

    // ── Modo Piloto: degustação 2 semanas, 1 comp, 4 conteúdos ───────────
    // Descontinuado na tela (03/10/2026); segue para quem está gravado nele.
    if (modoResolvido !== 'custom' && programaConfig.modo === 'piloto') {
      return await gerarTemporadaPiloto({
        colab, tdb, contexto, programaConfig, aiConfig, competenciaAlvo, turma,
      });
    }

    // ── Regular DUO (default global): 2 competências em blocos paralelos ──
    // Tenta a trilha de 2 comps; se o cargo não resolve 2 ou a 2ª comp não
    // tem assessment, FALHA ALTO (decisão de produto 28/07): antes caía no
    // fluxo single em silêncio e a pessoa recebia 1 competência em vez de 2
    // sem ninguém saber. O escape explícito é programa_modo='regular_single'
    // por colaborador (mig 154). O catch externo converte o throw em
    // { error } — a mensagem chega ao admin por colaborador no lote.
    if (modoResolvido !== 'custom' && (programaConfig.numCompetencias || 1) >= 2) {
      const duo = await gerarTemporadaRegularDuo({
        colab, empresa, tdb, sbRaw, contexto, programaConfig, aiConfig, competenciaAncora: competenciaAlvo, turma,
      });
      if (duo?.ok || duo?.error) return duo; // sucesso ou erro definitivo
      console.warn(`[gerarTemporada] DUO indisponível (${competenciaAlvo}):`, duo?.motivo);
      await registrarDegradacao({
        fluxo: 'trilha', tipo: DEGRADACAO.DUO_PARA_SINGLE, chave: colaboradorId,
        empresaId: colab.empresa_id, colaboradorId,
        detalhe: { motivo: duo?.motivo ?? null, competencia: competenciaAlvo },
      });
      throw new Error(`DUO indisponível (${duo?.motivo ?? 'motivo não informado'}) — rode o mapeamento da competência ou defina programa_modo='regular_single' explicitamente`);
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
      await registrarDegradacao({
        fluxo: 'trilha', tipo: DEGRADACAO.DESCRITOR_SEM_AVALIACAO, chave: colaboradorId,
        empresaId: colab.empresa_id, colaboradorId,
        detalhe: { competencia: competenciaAlvo, ausentes },
      });
    }

    if (assessment.length === 0) {
      return { error: `Competência "${competenciaAlvo}" sem descritores cadastrados — pule esta competência ou cadastre os descritores antes` };
    }

    // 5) Seleciona descritores e aloca semanas
    //
    // O BLUEPRINT tem precedência — mesma regra do DUO. Sem isto, o modo
    // jornada (numCompetencias=1, logo fora do ramo DUO) caía direto em
    // `selectDescriptors`, que aloca UM descritor por semana: modelo anterior
    // ao `conteudosPorSemana: 2`. Medido 14/08 na 1ª trilha de Macaé: o
    // blueprint trazia 2 descritores distintos em cada semana cobrindo os 6
    // gaps, e a trilha saiu com 4 descritores em 6 semanas — "Postura diante do
    // conflito" e "Escuta das partes" (nota 2,2, gap real) ficaram de fora, e as
    // semanas 4-6 avisaram "1 descritor para 2 entregas esperadas".
    //
    // Ou seja: o blueprint era gerado, auditado e IGNORADO neste modo, e o
    // `conteudosPorSemana: 2` era config morta — quem consultava não existia.
    let blueprintInputsSingle: BlueprintTrilhaInputs | null = null;
    if ((programaConfig.conteudosPorSemana || 1) >= 2) {
      const { data: bpRow, error: errBp } = await tdb.from('development_blueprints')
        .select('blueprint')
        .eq('colaborador_id', colab.id)
        .order('gerado_em', { ascending: false })
        .limit(1).maybeSingle();
      // Sem blueprint (ou sem conseguir lê-lo) a geração cai em `selectDescriptors`,
      // que aloca um descritor por semana. Era calado (R-85): agora fica registrado.
      if (errBp || !bpRow?.blueprint) {
        console.warn(`[${programaConfig.modo}] sem blueprint (${errBp?.message || 'não gerado'}), fallback selectDescriptors`);
        await registrarDegradacao({
          fluxo: 'trilha', tipo: DEGRADACAO.BLUEPRINT_ADAPTER_FALLBACK, chave: colab.id,
          empresaId: colab.empresa_id, colaboradorId: colab.id,
          detalhe: { error: errBp?.message || 'sem blueprint', competencia: competenciaAlvo },
        });
      }
      if (bpRow?.blueprint) {
        const r = blueprintToTrilhaInputs(bpRow.blueprint, { [competenciaAlvo]: assessment as any }, programaConfig);
        if ('error' in r) {
          console.warn(`[${programaConfig.modo}] blueprint→trilha indisponível (${r.error}) — fallback selectDescriptors`);
          await registrarDegradacao({
            fluxo: 'trilha', tipo: DEGRADACAO.BLUEPRINT_ADAPTER_FALLBACK, chave: colab.id,
            empresaId: colab.empresa_id, colaboradorId: colab.id,
            detalhe: { error: r.error, competencia: competenciaAlvo },
          });
        } else {
          blueprintInputsSingle = r;
          if (r.avisos.length) console.warn(`[${programaConfig.modo}] blueprint→trilha avisos:`, r.avisos);
        }
      }
    }

    const descritoresSelecionados = blueprintInputsSingle
      ? blueprintInputsSingle.descritoresSelecionados
      : selectDescriptors(assessment, programaConfig.slotsConteudo);

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
      blueprintBinding: blueprintInputsSingle?.bindingPorSemana,
    });

    // 7) Persiste trilha + progresso (fonte única dos 4 modos)
    const persist = await persistirTrilha(tdb, {
      colaboradorId,
      competenciaFoco: competenciaAlvo,
      competenciasFoco: [competenciaAlvo], // uniformiza com DUO (Fase 3 lê sempre o array)
      // O carimbo tem que descrever o PLANO que acabou de ser gerado. A jornada
      // também é single-competência e aterrissa aqui: carimbá-la de
      // 'regular_single' faria o runtime resolver 14 semanas para um plano de 7
      // — semana 8 a 14 inexistentes, missões em 4/8/12 e fechamento na 14 que
      // nunca chega. O fallback DUO→single segue carimbando 'regular_single',
      // porque ali o plano gerado É o single de 14.
      // O Personalizado carimba 'custom' e grava o snapshot com a duração e a
      // sequência dele; os presets não gravam snapshot (`undefined` limpa).
      programaModo: modoResolvido === 'custom' ? 'custom' : modoResolvido === 'jornada' ? 'jornada' : 'regular_single',
      programaConfig: snapshotConfig,
      semanas,
      descritoresSelecionados,
      turmaMembroId: ctxTurma.turmaMembroId,
      dataInicioTurma: ctxTurma.turmaDataInicio,
      novaJornada,
    });
    if ('error' in persist) return { error: persist.error };

    return {
      ok: true,
      trilhaId: persist.trilhaId,
      numeroTemporada: persist.numeroTemporada,
      // O encadeamento reativa a cadência com o calendário da trilha nova.
      dataInicio: persist.dataInicio,
      competencia: competenciaAlvo,
      ...(competenciasDoPrograma ? { competencias: competenciasDoPrograma, modo: 'custom' } : {}),
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
  turma?: ContextoGeracaoTurma;
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
      await registrarDegradacao({
        fluxo: 'trilha', tipo: DEGRADACAO.ONBOARDING_DEFAULT_NEUTRO, chave: `${colab.id}:${comp}`,
        empresaId: colab.empresa_id, colaboradorId: colab.id,
        detalhe: { competencia: comp },
      });
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
    turmaMembroId: args.turma?.turmaMembroId ?? null,
    dataInicioTurma: args.turma?.dataInicioTurma ?? null,
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
  turma?: ContextoGeracaoTurma;
  colab: any; empresa: any; tdb: any; sbRaw: any; contexto: string;
  programaConfig: any; aiConfig?: AIConfig; competenciaAncora?: string;
}): Promise<any> {
  const { colab, empresa, tdb, contexto, programaConfig, aiConfig, competenciaAncora } = args;

  // 1) Resolve 2 competências — prioridade (item D): FOCO do cargo (fonte única
  // com o PDI, mig 174) → sys_config override → top-2 do top10 (âncora primeiro).
  const { data: cargoFocoRow } = await tdb.from('cargos_empresa')
    .select('competencia_foco, competencias_foco').eq('nome', colab.cargo || '').maybeSingle();
  let comps: string[] = focoDoCargo(cargoFocoRow).slice(0, 2);
  // Config EFETIVA (empresa → turma → participação): a safra pode ter as suas
  // competências. Sem turma, é a sys_config da empresa — mesmo resultado de antes.
  const cfgDuo = args.turma?.config ?? empresa?.sys_config ?? {};
  if (comps.length < 2 && Array.isArray(cfgDuo.competencias_regular_duo)) {
    comps = cfgDuo.competencias_regular_duo.slice(0, 2);
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
    || cfgDuo.blueprint_drives_trilha === true;
  if (blueprintDrivesTrilha) {
    const { data: bpRow, error: errBp } = await tdb.from('development_blueprints')
      .select('blueprint')
      .eq('colaborador_id', colab.id)
      .order('gerado_em', { ascending: false })
      .limit(1).maybeSingle();
    // Flag ligada e sem blueprint: o fallback fica registrado (R-85), não calado.
    if (errBp || !bpRow?.blueprint) {
      console.warn(`[DUO] sem blueprint (${errBp?.message || 'não gerado'}), fallback selectDescriptorsDuo`);
      await registrarDegradacao({
        fluxo: 'trilha', tipo: DEGRADACAO.BLUEPRINT_ADAPTER_FALLBACK, chave: colab.id,
        empresaId: colab.empresa_id, colaboradorId: colab.id,
        detalhe: { error: errBp?.message || 'sem blueprint' },
      });
    }
    if (bpRow?.blueprint) {
      const r = blueprintToTrilhaInputs(bpRow.blueprint, assessmentPorComp, programaConfig);
      if ('error' in r) {
        console.warn(`[DUO] blueprint→trilha indisponível (${r.error}) — fallback selectDescriptorsDuo`);
        await registrarDegradacao({
          fluxo: 'trilha', tipo: DEGRADACAO.BLUEPRINT_ADAPTER_FALLBACK, chave: colab.id,
          empresaId: colab.empresa_id, colaboradorId: colab.id,
          detalhe: { error: r.error },
        });
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
    turmaMembroId: args.turma?.turmaMembroId ?? null,
    dataInicioTurma: args.turma?.dataInicioTurma ?? null,
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
  turma?: ContextoGeracaoTurma;
  colab: any; tdb: any; contexto: string;
  programaConfig: any; aiConfig?: AIConfig; competenciaAlvo: string;
  /**
   * Carimbo e snapshot opcionais. O Personalizado usava esta maquinaria até
   * 03/10/2026; hoje ele segue o caminho da Jornada e nenhum chamador passa
   * estes dois. Ficam para não mudar a assinatura de um núcleo exportado.
   */
  carimbo?: ProgramaModoLabel; snapshotConfig?: ProgramaConfig;
}) {
  const { colab, tdb, contexto, programaConfig, aiConfig, competenciaAlvo, carimbo = 'piloto', snapshotConfig } = args;

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
    programaModo: carimbo,
    semanas,
    descritoresSelecionados,
    programaConfig: snapshotConfig,
    turmaMembroId: args.turma?.turmaMembroId ?? null,
    dataInicioTurma: args.turma?.dataInicioTurma ?? null,
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
    modo: carimbo,
  };
}

/**
 * Competências do Personalizado com 2 competências, na ORDEM em que serão
 * percorridas: a âncora (a competência que a geração já resolveu: explícita,
 * trilha, cargo) SEMPRE em 1º, depois a mesma prioridade do DUO: foco do cargo
 * (fonte única com o PDI, mig 174), `sys_config.competencias_regular_duo`, top
 * 10 do cargo. Comparação por texto normalizado, como no encadeamento da
 * Jornada (`proximaCompetencia`): caixa ou espaço diferente não pode fazer a
 * mesma competência ser servida duas vezes.
 *
 * ⚠️ As três leituras não leem o `{ error }`: são o MESMO texto do gerador
 * anterior do Personalizado, dívida DECLARADA do guard E11
 * (`config/error-nao-checado-allowlist.json`). Reescrevê-las com o erro lido
 * obrigaria a encolher a allowlist, que é zona do dono. Falha de leitura aqui
 * não passa calada: vira "não há 2ª competência" e a geração FALHA alto
 * (`planejarTrilhaPersonalizada`), só que com a causa errada na mensagem.
 */
export async function resolverCompetenciasDoPersonalizado(
  tdb: any,
  colab: { cargo?: string | null },
  ancora: string,
  cfg: Record<string, any> | null | undefined,
): Promise<string[]> {
  const unicas = (lista: unknown[]): string[] => {
    const vistas = new Set<string>();
    const out: string[] = [];
    for (const c of lista) {
      if (typeof c !== 'string' || !c.trim()) continue;
      const chave = c.trim().toLowerCase();
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      out.push(c);
    }
    return out;
  };

  const { data: cargoFocoRow } = await tdb.from('cargos_empresa')
    .select('competencia_foco, competencias_foco').eq('nome', colab.cargo || '').maybeSingle();
  const doSysConfig = Array.isArray(cfg?.competencias_regular_duo) ? cfg!.competencias_regular_duo : [];
  let comps = unicas([ancora, ...focoDoCargo(cargoFocoRow), ...doSysConfig]);
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
      comps = unicas([...comps, ...top10.map((t: any) => mapa[t.competencia_id])]);
    }
  }
  return comps.slice(0, 2);
}

export type PlanoPersonalizado =
  | { config: ProgramaConfig; competencia: string; competencias: string[] }
  | { error: string; codigo: string };

/**
 * Modo PERSONALIZADO (03/10/2026): decide a config DESTA trilha e a
 * competência dela. A trilha em si sai pelo caminho da Jornada em
 * `gerarTemporadaCoreHeadless` (seleção por lacuna, 2 conteúdos e 1 desafio
 * por semana), com carimbo 'custom' e o snapshot desta config.
 *
 * Três entradas possíveis:
 *  1. ENCADEAMENTO (`configCongelada`): a trilha da competência seguinte, com
 *     as regras congeladas no snapshot da anterior. A competência é a da
 *     posição gravada.
 *  2. REGERAÇÃO da mesma trilha (`sequenciaExistente`): a duração vem da tela
 *     de hoje (custom regerado em custom deriva o snapshot de novo, regra da
 *     trava de regeração), mas a posição no programa e as competências não
 *     mudam.
 *  3. PRIMEIRA trilha: com 2 competências, resolve as duas e exige o
 *     mapeamento das DUAS antes de gerar a primeira. Se não der, FALHA ALTO
 *     com erro acionável (a régua de 28/07 para o DUO: na construção, nunca
 *     rebaixar para 1 competência em silêncio). Antes o Personalizado
 *     degradava para 1 sem avisar ninguém.
 */
export async function planejarTrilhaPersonalizada(args: {
  tdb: any;
  colab: { id: string; cargo?: string | null };
  cfg: Record<string, any> | null | undefined;
  competenciaAlvo: string;
  configCongelada?: ProgramaConfig;
  sequenciaExistente?: SequenciaPersonalizado | null;
}): Promise<PlanoPersonalizado> {
  const { tdb, colab, cfg, competenciaAlvo, configCongelada, sequenciaExistente } = args;

  if (configCongelada) {
    const seq = parseSequenciaPersonalizado(configCongelada.sequenciaPersonalizado);
    if (!seq) {
      return {
        error: 'Encadeamento do Personalizado sem a sequência de competências no snapshot da trilha anterior. Nada foi gerado.',
        codigo: 'custom_sem_sequencia',
      };
    }
    return { config: configCongelada, competencia: seq.competencias[seq.posicao - 1], competencias: seq.competencias };
  }

  const inputs = parseProgramaCustom(cfg?.programa_custom);
  if (!inputs) {
    return {
      error: 'Modo Personalizado sem configuração válida (sys_config.programa_custom). Defina semanas, competências e fechamento em Configurações → Programa antes de gerar.',
      codigo: 'custom_sem_config',
    };
  }
  const base = derivarConfigCustom(inputs);

  if (sequenciaExistente) {
    return {
      config: { ...base, sequenciaPersonalizado: sequenciaExistente },
      competencia: sequenciaExistente.competencias[sequenciaExistente.posicao - 1],
      competencias: sequenciaExistente.competencias,
    };
  }

  if (inputs.numCompetencias < 2) {
    return { config: base, competencia: competenciaAlvo, competencias: [competenciaAlvo] };
  }

  const comps = await resolverCompetenciasDoPersonalizado(tdb, colab, competenciaAlvo, cfg);
  if (comps.length < 2) {
    return {
      error: `O Personalizado está configurado com 2 competências, mas não há uma 2ª competência para o cargo "${colab.cargo || 'sem cargo'}" além de "${competenciaAlvo}". Defina as competências foco do cargo, ou configure o Personalizado com 1 competência. Nada foi gerado.`,
      codigo: 'custom_segunda_competencia',
    };
  }

  // O mapeamento das DUAS antes de gerar a primeira: a segunda nasce sozinha
  // no fim da primeira, semanas depois, e descobrir lá que ela não tem
  // avaliação deixaria a pessoa sem a segunda competência e sem ninguém saber.
  // (Mesma leitura, e mesma dívida E11, do gerador anterior; ver acima.)
  for (const c of comps) {
    const { data } = await tdb.from('descriptor_assessments')
      .select('descritor, nota')
      .eq('colaborador_id', colab.id)
      .eq('competencia', c);
    if (!data?.length) {
      return {
        error: `O Personalizado está configurado com 2 competências ("${comps[0]}" e depois "${comps[1]}"), e o colaborador ainda não tem avaliação (descriptor_assessments) em "${c}". Rode o mapeamento dessa competência, ou configure o Personalizado com 1 competência. Nada foi gerado.`,
        codigo: 'sem_assessment',
      };
    }
  }

  return {
    config: { ...base, sequenciaPersonalizado: { competencias: comps, posicao: 1 } },
    competencia: comps[0],
    competencias: comps,
  };
}

/**
 * Persistência de trilha + progresso — FONTE ÚNICA dos modos (single, DUO,
 * onboarding, piloto, jornada), que mantinham cópias byte-quase-idênticas
 * deste bloco. Regras: UPSERT no UNIQUE (empresa_id, colaborador_id,
 * numero_temporada) — mig 199; sem `novaJornada`, o número e o `data_inicio`
 * da trilha atual são mantidos (regenerar não infla contador nem move o
 * calendário de quem já começou); semana 1 NOVA nasce em_andamento.
 *
 * `novaJornada: true` (encadeamento do DUO, 05/08/2026) cria a PRÓXIMA trilha:
 * numero_temporada + 1 e calendário começando na próxima segunda. A jornada
 * anterior fica intacta, com seu fechamento, seu relatório e seu certificado.
 *
 * O progresso é gravado por UPSERT que PRESERVA o trabalho do colaborador
 * (reflexão, feedback, tira-dúvidas, consumo) — antes era delete+insert, que
 * apagava tudo isso a cada regeneração, sem backup e sem aviso.
 */
export async function persistirTrilha(tdb: any, args: {
  colaboradorId: string;
  competenciaFoco: string;
  competenciasFoco: string[];
  programaModo: ProgramaModoLabel;
  semanas: any[];
  descritoresSelecionados: any[];
  /** Modo custom: snapshot da config derivada (mig 182). Presets: undefined → null. */
  programaConfig?: ProgramaConfig;
  /** Encadeamento: cria a próxima jornada em vez de regravar a atual. */
  novaJornada?: boolean;
  /** CARIMBO da participação que originou a trilha (mig 210). null = trilha sem turma. */
  turmaMembroId?: string | null;
  /**
   * Segunda-feira canônica da TURMA. Quando a participação tem turma com data,
   * o calendário da trilha nasce nela — não em `nextMondayISO()`. Sem isso, duas
   * pessoas da mesma safra geradas em semanas diferentes teriam calendários
   * diferentes, que é a coorte se desfazendo sozinha.
   */
  dataInicioTurma?: string | null;
}): Promise<{ trilhaId: string; numeroTemporada: number; dataInicio: string } | { error: string }> {
  const { colaboradorId, competenciaFoco, competenciasFoco, programaModo, semanas, descritoresSelecionados, programaConfig, novaJornada, turmaMembroId, dataInicioTurma } = args;

  // Normaliza campos DERIVADOS de conteudos_dia antes de salvar (chokepoint dos 4
  // modos): garante que descritores_cobertos/descritor/label/dia SEMPRE reflitam os
  // conteudos_dia reais. Reorder/merge da regeneração podia desincronizar (título ≠
  // blocos, dias errados). Idempotente.
  normalizarSemanas(semanas);

  // Ordena por numero_temporada (não por criado_em): com jornadas sequenciais,
  // "a trilha do colaborador" é a de maior temporada. Por criado_em, regerar a
  // jornada 1 depois de a 2 existir a faria virar "a atual" e o encadeamento
  // criaria uma terceira.
  const { data: existente, error: errExistente } = await tdb.from('trilhas')
    .select('id, numero_temporada, data_inicio, turma_membro_id, status, programa_modo, programa_config')
    .eq('colaborador_id', colaboradorId)
    .order('numero_temporada', { ascending: false }).limit(1).maybeSingle();
  if (errExistente) return { error: `trilha atual (leitura): ${errExistente.message}` };

  // A mesma trava do início da geração, relida logo antes de gravar: a pessoa
  // pode ter concluído a trilha enquanto a IA gerava o plano (minutos). Sobra
  // uma janela de milissegundos entre esta leitura e o upsert abaixo.
  const trava = travaRegeracao(existente, { modoNovo: programaModo, novaJornada, turmaMembroId });
  if (trava) return { error: trava.mensagem };

  // ⚠️ TROCA DE PARTICIPAÇÃO cria trilha nova, mesmo sem `novaJornada` explícito.
  //
  // Sem isto, gerar a primeira trilha de alguém numa turma NOVA reusaria o
  // `numero_temporada` da participação anterior e o upsert bateria na MESMA
  // linha — a trilha da turma antiga (com o fechamento, o relatório e o
  // certificado dela) seria SOBRESCRITA em silêncio. Derivar aqui, e não no
  // caller, é o que garante que nenhum caminho de geração esqueça.
  const trocouDeParticipacao =
    !!turmaMembroId && !!existente?.turma_membro_id && existente.turma_membro_id !== turmaMembroId;
  const criarNova = !!novaJornada || trocouDeParticipacao;

  // Com UPDATE na mesma row, regenerar não infla o contador.
  const numeroTemporada = criarNova
    ? (existente?.numero_temporada || 0) + 1
    : (existente?.numero_temporada || 1);
  const { nextMondayISO } = await import('@/lib/season-engine/week-gating');
  const proximaSegunda = nextMondayISO();
  // empresa_id é injetado pelo tdb.upsert — não precisa repetir aqui.
  const payload = {
    colaborador_id: colaboradorId,
    competencia_foco: competenciaFoco,          // compat — âncora
    competencias_foco: competenciasFoco,        // array (migration 091)
    numero_temporada: numeroTemporada,
    temporada_plano: semanas,
    descritores_selecionados: descritoresSelecionados,
    programa_modo: programaModo,                // carimbo do runtime (mig 154)
    // Snapshot da config (mig 182): só o modo custom grava; sempre presente no
    // payload pra LIMPAR snapshot antigo ao regenerar a mesma trilha em preset.
    programa_config: programaConfig ?? null,
    status: TRILHA.ATIVA,
    // PRESERVA o calendário de quem já começou (F-I1 do docs/FMEA-PIPELINE.md).
    // Antes gravava `nextMondayISO()` no UPDATE também: regenerar a trilha de alguém
    // na semana 8 jogava `data_inicio` para a próxima segunda e a pessoa voltava ao
    // calendário zero — o week-gating libera por `data_inicio`, então ela perdia
    // acesso a 7 semanas de conteúdo de uma vez. Só a PRIMEIRA gravação calcula.
    // Jornada nova começa na próxima segunda; regeneração preserva o
    // calendário de quem já está no meio (F-I1).
    // Turma (mig 210): a safra tem uma segunda-feira canônica; quem entra nela
    // herda esse calendário. Sem turma (ou turma sem data) → comportamento
    // idêntico ao anterior.
    // 🔴 A JORNADA SEGUINTE NÃO HERDA A DATA DA TURMA (R-90, 03/10/2026). A data
    // da turma é a segunda da PRIMEIRA jornada, semanas no passado quando o
    // encadeamento cria a segunda: herdá-la abria as 7 semanas de uma vez, todas
    // liberadas por data. Com `novaJornada`, o calendário é a próxima segunda,
    // ou a da turma se ela ainda estiver no futuro (datas ISO comparam por texto).
    data_inicio: novaJornada
      ? (dataInicioTurma && dataInicioTurma > proximaSegunda ? dataInicioTurma : proximaSegunda)
      : criarNova
        ? (dataInicioTurma || proximaSegunda)
        : (existente?.data_inicio || dataInicioTurma || proximaSegunda),
    turma_membro_id: turmaMembroId ?? null,     // carimbo da participação (mig 210)
    cursos: [],                                 // legado — conteúdo vive em temporada_plano
  };

  // F-C1 (docs/FMEA-PIPELINE.md): o header vira UPSERT atômico no UNIQUE que já
  // existe — (empresa_id, colaborador_id). O SELECT-then-write anterior tinha 2
  // falhas silenciosas sob regeneração concorrente: UPDATE batendo em 0 linhas
  // (a row sumiu entre o SELECT e o UPDATE) e INSERT colidindo no UNIQUE (a row
  // nasceu entre os dois). Mesmo padrão de development_blueprints
  // (lib/blueprint/core.ts). O SELECT acima SEGUE — lê data_inicio (F-I1) e
  // numero_temporada da trilha atual; a gravação é que não pode mais se perder.
  const { data: salva, error } = await tdb.from('trilhas')
    .upsert(payload, { onConflict: 'empresa_id,colaborador_id,numero_temporada' })
    .select('id').maybeSingle();
  if (error) return { error: error.message };
  const trilhaId: string = salva.id;

  // ── PROGRESSO: preserva o que a PESSOA produziu ──────────────────────────────
  //
  // Antes isto era `delete` da trilha inteira + `insert`. O `delete` não apagava
  // "progresso": apagava REFLEXÕES, FEEDBACKS, TRANSCRIPTS de tira-dúvidas e as
  // marcações de conteúdo consumido — texto que o colaborador escreveu, sem backup
  // e sem aviso. Regenerar a trilha de alguém no meio do programa destruía o
  // registro das avaliações dele. Medido em 27/07, antes da correção: 36 linhas com
  // reflexão/feedback/tira-dúvidas e 55 com consumo marcado, em 675.
  //
  // Agora: UPSERT por (trilha_id, semana) — a chave única que já existe. Grava só
  // o que é ESTRUTURAL (tipo da semana); tudo que é da pessoa fica de fora do
  // payload e sobrevive intacto. `status` também não é reescrito: quem já concluiu
  // a semana 1 não deve voltar a "em andamento" porque um admin regenerou.
  const { data: existentes, error: errLer } = await tdb.from('temporada_semana_progresso')
    .select('semana, reflexao, feedback, tira_duvidas, conteudo_consumido, status')
    .eq('trilha_id', trilhaId);
  if (errLer) return { error: `progresso (leitura): ${errLer.message}` };
  const jaExiste = new Map<number, any>((existentes || []).map((r: any) => [Number(r.semana), r]));

  const progressos = semanas.map((sem: any) => {
    const anterior = jaExiste.get(Number(sem.semana));
    return {
      trilha_id: trilhaId,
      colaborador_id: colaboradorId,
      semana: sem.semana,
      tipo: sem.tipo,
      // Semana nova nasce com o status inicial; semana que já existe mantém o dela.
      status: anterior ? anterior.status : (sem.semana === 1 ? PROGRESSO.EM_ANDAMENTO : PROGRESSO.PENDENTE),
    };
  });

  // F-C2: o erro é PROPAGADO — antes os statements de progresso ignoravam `error`,
  // em contraste com os `if (error) return` da mesma função. Num interleave de
  // regeneração concorrente o insert colidia no UNIQUE(trilha_id, semana) e falhava
  // inteiro: plano de um run, progresso de outro, com a função devolvendo sucesso.
  const { error: errUpsert } = await tdb.from('temporada_semana_progresso')
    .upsert(progressos, { onConflict: 'trilha_id,semana' });
  if (errUpsert) return { error: `progresso (gravação): ${errUpsert.message}` };

  // Semanas que sumiram do plano (plano encolheu — ex.: 14 → 2 no modo piloto).
  // Só se apagam as VAZIAS: uma semana órfã que guarda reflexão vale mais preservada
  // do que limpa. Sem esta guarda, mudar o modo do programa apagaria o trabalho de
  // quem já estava adiantado.
  const { descartaveis, preservadas } = classificarOrfas(existentes || [], semanas);
  if (descartaveis.length) {
    await tdb.from('temporada_semana_progresso').delete().eq('trilha_id', trilhaId).in('semana', descartaveis);
  }
  if (preservadas.length) {
    console.warn(`[persistirTrilha] trilha ${trilhaId}: semanas ${preservadas.join(',')} saíram do plano mas GUARDAM trabalho do colaborador — preservadas.`);
  }

  return { trilhaId, numeroTemporada, dataInicio: payload.data_inicio };
}

/**
 * A linha de progresso guarda trabalho do COLABORADOR? (≠ progresso do sistema)
 *
 * `status` e os timestamps são estado da máquina; `reflexao`, `feedback`,
 * `tira_duvidas` e `conteudo_consumido` são o que a pessoa produziu ou fez. A
 * distinção existe porque regenerar uma trilha pode legitimamente reescrever o
 * primeiro grupo — nunca o segundo.
 */
export function temTrabalhoDoColaborador(r: any): boolean {
  // `consumiuConteudo` e não o truthy cru: esta é a catraca que decide se uma
  // semana pode ser REESCRITA, e `conteudo_consumido` pode chegar como array
  // (video-tracking). Um array vazio é truthy em JS — bloquearia a regeneração
  // alegando trabalho que não existe. Hoje não há array nenhum no banco (0 de
  // 941, censo de 25/08/2026), então isto não muda comportamento; muda o que
  // acontece no dia em que o primeiro curso for cadastrado.
  return !!(r?.reflexao || r?.feedback || r?.tira_duvidas) || consumiuConteudo(r?.conteudo_consumido);
}

/**
 * Separa as linhas de progresso que saíram do plano novo entre descartáveis e
 * preservadas.
 *
 * Acontece quando o plano ENCOLHE (14 semanas → 2, ao trocar o modo do programa).
 * A regra: só se apaga o que está vazio. Uma semana órfã que guarda reflexão vale
 * mais preservada do que limpa — sem esta guarda, mudar o modo do programa apagaria
 * o trabalho de quem já estava adiantado.
 */
export function classificarOrfas(existentes: any[], semanasDoPlano: any[]): { descartaveis: number[]; preservadas: number[] } {
  const noPlano = new Set((semanasDoPlano || []).map((s: any) => Number(s.semana)));
  const orfas = (existentes || []).filter((r: any) => !noPlano.has(Number(r.semana)));
  return {
    descartaveis: orfas.filter((r) => !temTrabalhoDoColaborador(r)).map((r: any) => Number(r.semana)),
    preservadas: orfas.filter(temTrabalhoDoColaborador).map((r: any) => Number(r.semana)),
  };
}

/**
 * Reconcilia os campos DERIVADOS de `conteudos_dia` numa lista de semanas:
 * descritores_cobertos, descritor (topo), label ("Pílula N") e dia — que a UI e o
 * cron esperam consistentes com o que está de fato em conteudos_dia. Idempotente.
 * (Function declaration → hoisted, pode ser chamada antes da definição.)
 */
export function normalizarSemanas(semanas: any[]): any[] {
  for (const s of (semanas || [])) {
    const cd = Array.isArray(s?.conteudos_dia) ? s.conteudos_dia : null;
    if (!cd || !cd.length) continue;
    cd.forEach((e: any, i: number) => {
      e.label = `Pílula ${i + 1}`;
      e.dia = i === 0 ? 'segunda' : 'terca';
    });
    s.descritores_cobertos = cd.map((e: any) => e.descritor).filter(Boolean);
    s.descritor = cd[0]?.descritor ?? s.descritor ?? null;
  }
  return semanas;
}

export function inferirContexto(segmento?: string | null): string {
  if (!segmento) return 'generico';
  const s = String(segmento).toLowerCase();
  if (s.includes('educa') || s.includes('escola')) return 'educacional';
  if (s.includes('saude') || s.includes('saúde')) return 'corporativo';
  return 'corporativo';
}
