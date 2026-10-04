'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail, canViewColabJourney } from '@/lib/authz';
import { selectDescriptors, selectDescriptorsMulti, selectDescriptorsPiloto } from '@/lib/season-engine/select-descriptors';
import { escolherCenarioB } from '@/lib/season-engine/cenario-b';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';
import { entregaEhReal } from '@/lib/season-engine/week-gating';
import { overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';
import { formatosTop2DaPessoa } from '@/lib/season-engine/kit/formatos-por-preferencia';
import { getProgramaConfigByModo, getProgramaConfigDaTrilha, normalizarModoPrograma } from '@/lib/season-engine/programa-config';
import { conteudosServiveisPorCargo } from '@/lib/season-engine/build-season';
import { carregarConfigsEfetivasEmLote } from '@/lib/turmas';
import { parseProgramaCustom, derivarConfigCustom } from '@/lib/season-engine/programa-custom';
import { resolverConfigDaTrilha } from '@/lib/season-engine/trilha-runtime';
import { gerarTemporadaCoreHeadless, normalizarSemanas, resolverCompetenciasDoOnboarding, resolverCompetenciasDoPersonalizado } from '@/lib/season-engine/trilha-core';
import type { AIConfig } from './ai-client';
import { z } from 'zod';
import { requireAdminAction, requireUserAction, getAuthenticatedEmailFromAction, assertTenantAccessAction } from '@/lib/auth/action-context';
import { protectedAction, DomainError } from '@/lib/auth/protected-action';
import { findTrilhaComTenant, updateTrilhaInTenant, updateSemanaProgressoInTenant } from '@/lib/repositories/trilhas-repo';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { PROGRESSO, TRILHA } from '@/lib/status';
import { marcarSemanaConsumida } from '@/lib/season-engine/consumo-conteudo';
import { statusAoTocarSemana } from '@/lib/season-engine/progresso-semana';

interface GerarTemporadaParams {
  colaboradorId?: string;
  competencia?: string;
  aiConfig?: AIConfig;
}

/**
 * Wrapper: carrega temporada do colab logado via email.
 */
export async function loadTemporadaPorEmail(email: string, opts: { semanaTranscrito?: number; trilhaId?: string; incluirAnterior?: boolean } = {}) {
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

/**
 * Wrapper fino do núcleo headless (`lib/season-engine/trilha-core.ts`): aplica
 * SEMPRE o gate de sessão (`requireAdminSupabase`) e delega. Geração sem sessão
 * (seed/reset de demo, task Trigger, cron) chama `gerarTemporadaCoreHeadless`
 * direto, como `lib/blueprint/core.ts`.
 */
async function gerarTemporadaCore(params: GerarTemporadaParams = {}) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  return gerarTemporadaCoreHeadless(sbRaw, params);
}

/**
 * Check de PRONTIDÃO (admin, antes de liberar) do Piloto, do Personalizado e do
 * Onboarding: pra cada colaborador, resolve a competência âncora + top-4
 * descritores (Onboarding: as 5 competências do Top 5 do cargo) e verifica POR
 * PRESENÇA:
 *   - CORE (bloqueador): descritor sem NENHUM micro-conteúdo utilizável
 *     (nem match direto do descritor, nem pool da competência) → a semana
 *     nasceria com fallback templated. Sinalizado como bloqueador.
 *   - Match direto ausente (aviso): usa pool da competência — degrada, ok.
 *   - Formatos opcionais faltando: ok, o switch degrada.
 *   - Cenário B (bloqueador do fechamento): sem banco_cenarios tipo
 *     'cenario_b' DA COMPETÊNCIA da trilha → fechamento retornaria 424. Gerar via
 *     Fase 5. A régua é a MESMA do fechamento (`escolherCenarioB`, R-21): antes
 *     olhava só o cargo, e a pessoa aparecia "pronta" com o B de outra
 *     competência, ou com B só por competência num Onboarding que precisa de um
 *     que cubra as 5.
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

    // O modo é o que a GERAÇÃO resolveria para cada pessoa, na MESMA precedência
    // (participação → turma → override do colaborador → empresa → Jornada): o
    // check cobre quem resolveria pra degustação, 'piloto' (preset) OU 'custom'
    // (builder) OU 'onboarding'. Lia só o override e a empresa, e dizia "pronto" ou "sem alvo"
    // sobre uma config que a turma da pessoa pode ter trocado (R-101).
    const configPorColab = await carregarConfigsEfetivasEmLote(sbRaw, empresaId, todosColabs as any[], empresa?.sys_config || {});
    const modoPorColab = new Map<string, string>(
      (todosColabs as any[]).map(c => [c.id, normalizarModoPrograma(configPorColab.get(c.id)?.programa_modo)]),
    );
    const colabs = (todosColabs as any[]).filter(
      c => ['piloto', 'custom', 'onboarding'].includes(modoPorColab.get(c.id) as string),
    );
    if (!colabs.length) {
      throw new Error(`Nenhum colaborador resolveria pra piloto, personalizado ou onboarding (default da empresa: ${empresa?.sys_config?.programa_modo || 'jornada, o padrão'}; nenhum override individual nem de turma). Marque colaboradores em Configurações → Equipe ou mude o default do Programa.`);
    }
    const configPiloto = getProgramaConfigByModo('piloto');
    const configOnboarding = getProgramaConfigByModo('onboarding');

    const resultados: any[] = [];
    const conteudoCache: Record<string, any[]> = {};
    // Personalizado com 2 competências: a resolução da 2ª é por (cargo, âncora),
    // então uma consulta serve a todo mundo do mesmo cargo.
    const competenciasPorCargoAncora = new Map<string, string[]>();

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

    // Batch (era 1 query POR colab): todas as avaliações dos colabs de uma vez,
    // indexadas por (colaborador_id | competencia).
    const { data: assessmentsTodos } = await tdb.from('descriptor_assessments')
      .select('colaborador_id, competencia, descritor, nota')
      .in('colaborador_id', colabIds);
    const assessmentsPorColabComp = new Map<string, any[]>();
    for (const a of (assessmentsTodos || []) as any[]) {
      const key = `${a.colaborador_id}|${a.competencia}`;
      const arr = assessmentsPorColabComp.get(key);
      if (arr) arr.push(a); else assessmentsPorColabComp.set(key, [a]);
    }

    for (const colab of colabs as any[]) {
      const modoColab = modoPorColab.get(colab.id);
      // Config do modo custom (builder) da PESSOA: a efetiva dela, não a da
      // empresa. Inválida/ausente → bloqueador por colaborador custom.
      const cfgEfetiva = configPorColab.get(colab.id) || {};
      const inputsCustom = modoColab === 'custom' ? parseProgramaCustom(cfgEfetiva.programa_custom) : null;
      const cfg = modoColab === 'custom' ? (inputsCustom ? derivarConfigCustom(inputsCustom) : null) : modoColab === 'onboarding' ? configOnboarding : configPiloto;
      if (!cfg) {
        resultados.push({ colaborador: colab.nome_completo, pronto: false, bloqueadores: ['Modo Personalizado sem configuração válida (sys_config.programa_custom) — defina em Configurações → Programa'] });
        continue;
      }

      // Competência âncora — MESMA resolução da geração (trilha → cargo)
      const ancora: string | undefined = compPorColab.get(colab.id) || (colab.cargo ? compPorCargo.get(colab.cargo) : undefined);
      // O Onboarding cobre o Top 5 do cargo e não usa a competência foco.
      if (!ancora && modoColab !== 'onboarding') {
        resultados.push({ colaborador: colab.nome_completo, pronto: false, bloqueadores: ['Sem competência foco resolvível (trilha/cargo)'] });
        continue;
      }

      const bloqueadores: string[] = [];
      const avisos: string[] = [];

      // Descritores que a geração vai trabalhar, POR competência do programa.
      //  - Piloto (descontinuado na tela, segue para quem está gravado nele):
      //    top-N distintos por gap, N = semanas × conteúdos por semana.
      //  - Personalizado (03/10/2026): a seleção da Jornada (`selectDescriptors`,
      //    o fallback de quando não há blueprint), que distribui as semanas
      //    entre os descritores por lacuna e NÃO exige um descritor por pílula.
      //    Com 2 competências, a geração exige as duas resolvidas e mapeadas
      //    antes de gerar a primeira; aqui é a mesma checagem, como bloqueador.
      const alvos: { competencia: string; descritores: string[] }[] = [];
      if (modoColab === 'onboarding') {
        //  - Onboarding (R-100): as competências do Top 5 do cargo, cada uma com
        //    a avaliação da pessoa, pela MESMA função da geração. O que a geração
        //    recusaria vira bloqueador aqui, com a mesma mensagem. A config é a da
        //    empresa (o modo desta tela também é resolvido no nível da empresa).
        const resolvido = await resolverCompetenciasDoOnboarding(tdb, colab, empresa?.sys_config, cfg.numCompetencias || 5);
        if ('error' in resolvido) {
          bloqueadores.push(resolvido.error);
        } else {
          const sel = selectDescriptorsMulti(resolvido.assessments, cfg.semanaParaCompetenciaIdx!, cfg.nivelMetaAlvo);
          for (const comp of resolvido.competencias) {
            alvos.push({ competencia: comp, descritores: sel.filter(d => d.competencia === comp).map(d => d.descritor) });
          }
        }
      } else if (modoColab === 'custom') {
        let comps = [ancora];
        if ((inputsCustom?.numCompetencias || 1) >= 2) {
          const chave = `${colab.cargo || ''}|${ancora}`;
          if (!competenciasPorCargoAncora.has(chave)) {
            competenciasPorCargoAncora.set(chave, await resolverCompetenciasDoPersonalizado(tdb, colab, ancora, cfgEfetiva));
          }
          const resolvidas = competenciasPorCargoAncora.get(chave)!;
          if (resolvidas.length < 2) {
            bloqueadores.push(`Personalizado com 2 competências: o cargo "${colab.cargo || 'sem cargo'}" não tem uma 2ª competência além de "${ancora}". Defina as competências foco do cargo ou configure 1 competência.`);
          } else {
            comps = resolvidas;
            avisos.push(`2 competências em sequência: "${comps[0]}" e depois "${comps[1]}" (a segunda nasce quando a primeira conclui)`);
          }
        }
        for (const c of comps) {
          const assessment = assessmentsPorColabComp.get(`${colab.id}|${c}`) || [];
          if (!assessment.length) {
            bloqueadores.push(`Sem avaliação (mapeamento) em "${c}": complete o mapeamento dessa competência`);
            continue;
          }
          alvos.push({ competencia: c, descritores: selectDescriptors(assessment, cfg.slotsConteudo).map(d => d.descritor) });
        }
      } else {
        const porSemana = cfg.conteudosPorSemana || 2;
        const esperado = (cfg.slotsConteudo?.length || 2) * porSemana;
        const assessment = assessmentsPorColabComp.get(`${colab.id}|${ancora}`) || [];
        const top = selectDescriptorsPiloto(ancora, assessment, cfg.slotsConteudo, porSemana);
        if (top.length < esperado) {
          bloqueadores.push(`Só ${top.length}/${esperado} descritores avaliados distintos em "${ancora}": complete o mapeamento`);
        }
        alvos.push({ competencia: ancora, descritores: top.map(d => d.descritor) });
      }

      for (const alvo of alvos) {
        const comp = alvo.competencia;
        // Conteúdos da competência (empresa OU global), 1 query por competência.
        // Os MESMOS filtros da geração (`montarSemanaConteudo`): ativo, fora de
        // KIT (`kit_id` e `disc` nulos: conteúdo de kit é de um DISC e sai só
        // pelo overlay) e, abaixo, só o que serve ao CARGO da pessoa. Sem eles a
        // prontidão contava como pronto o que a geração não serviria.
        if (!conteudoCache[comp]) {
          const { data: conteudos, error: errConteudos } = await sbRaw.from('micro_conteudos')
            .select('descritor, formato, cargo')
            .eq('ativo', true).is('kit_id', null).is('disc', null).eq('competencia', comp)
            .or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
          if (errConteudos) throw new Error(`Falha ao ler os conteúdos de "${comp}": ${errConteudos.message}`);
          conteudoCache[comp] = conteudos || [];
        }
        const pool = conteudosServiveisPorCargo(conteudoCache[comp], colab.cargo);
        const formatosPool = new Set(pool.map((c: any) => c.formato));

        for (const descritor of alvo.descritores) {
          const doDescritor = pool.filter((c: any) => c.descritor === descritor);
          if (doDescritor.length === 0 && pool.length === 0) {
            bloqueadores.push(`"${descritor}": SEM formato-core (nenhum conteúdo da competência), a semana nasceria com fallback`);
          } else if (doDescritor.length === 0) {
            avisos.push(`"${descritor}": sem conteúdo próprio, reusa o pool da competência (${[...formatosPool].join(', ')})`);
          } else {
            const formatosDesc = new Set(doDescritor.map((c: any) => c.formato));
            const faltando = ['video', 'texto', 'audio', 'case'].filter(f => !formatosDesc.has(f));
            if (faltando.length) avisos.push(`"${descritor}": opcionais faltando no switch (${faltando.join(', ')}), ok, degrada`);
          }
        }
      }

      // Fechamento: o Cenário B tem que ser DA COMPETÊNCIA da trilha, pela MESMA
      // escolha que o fechamento faz (`escolherCenarioB`, R-21). Cada trilha do
      // Piloto e do Personalizado fecha em UMA competência; o Onboarding fecha
      // nas 5 de uma vez e precisa de um B que cubra todas (integrador). Modo SEM
      // fechamento (custom, semanasAvaliacao=[]) não precisa de Cenário B.
      if (cfg.semanasAvaliacao.length > 0 && alvos.length > 0) {
        const cargoB = colab.cargo || 'todos';
        const grupos = modoColab === 'onboarding' ? [alvos.map(a => a.competencia)] : alvos.map(a => [a.competencia]);
        for (const comps of grupos) {
          let escolha: Awaited<ReturnType<typeof escolherCenarioB>>;
          try {
            escolha = await escolherCenarioB(sbRaw, empresaId, cargoB, comps, { registrar: false });
          } catch (e: any) {
            bloqueadores.push(`Fechamento: não consegui conferir o Cenário B (${e?.message || e})`);
            continue;
          }
          if (escolha.cenario) continue;
          bloqueadores.push(comps.length > 1
            ? `Fechamento sem Cenário B integrador que cubra as ${comps.length} competências do programa (${comps.join(', ')}): o lote de Cenários B gera um por competência e não serve ao Onboarding, que fecha nas ${comps.length} de uma vez. Gere o integrador em "Cenário B integrador (Onboarding)", na fase de Reavaliação do pipeline da empresa, antes do fechamento`
            : `Fechamento sem Cenário B da competência "${comps[0]}" pro cargo "${cargoB}": gere na Fase 5 (Cenários B em lote). O B de outra competência não serve, o fechamento avaliaria a coisa errada`);
        }
      }

      resultados.push({
        colaborador: colab.nome_completo,
        cargo: colab.cargo,
        competencia: alvos.map(a => a.competencia).join(' + ') || ancora || '',
        modo: modoColab,
        descritores: alvos.flatMap(a => a.descritores),
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

/**
 * @deprecated F-E4 (docs/FMEA-PIPELINE.md): o lote síncrono rodava N gerações
 * de temporada (~6 chamadas de IA cada) em loop serial dentro de UMA server
 * action — 1 colab já podia estourar o maxDuration da Vercel (300s) e o lote
 * inteiro morria 504. O padrão vigente é FILA + LOOP NO CLIENT (1 server
 * action por colab): `listarColabsParaTrilha` (actions/fase4.ts) +
 * `gerarTemporada` — ver o ramo 'temporadas' em
 * app/admin/empresas/[empresaId]/page.tsx, mesmo padrão de `filaBlueprint` +
 * `gerarBlueprint`. Este stub gated só RECUSA o lote inline e aponta o
 * caminho novo — nenhuma chamada de IA nem varredura de banco roda aqui.
 */
const GerarLoteInput = z.object({
  empresaId: z.string().min(1),
  aiConfig: z.record(z.string(), z.any()).optional(),
});

const _gerarTemporadasLote = protectedAction('ai.audit.regenerate', GerarLoteInput, async (ctx, { empresaId }) => {
  await assertTenantAccessAction(ctx, empresaId);
  throw new Error(
    'gerarTemporadasLote (lote síncrono) descontinuado — F-E4: use listarColabsParaTrilha + gerarTemporada por colaborador no client',
  );
});
/**
 * Wrapper POSICIONAL achatador (legado): `montarTrilhasLote`
 * (actions/fase4.ts, também depreciado) chama `(empresaId, aiConfig)` e lê
 * success/error no TOPO — o envelope do protectedAction fica interno.
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
      'id, colaborador_id, empresa_id, competencia_foco, competencias_foco, temporada_plano, descritores_selecionados, programa_modo, programa_config',
    );
    if (!trilha) throw new Error('Trilha não encontrada');
    await assertTenantAccessAction(ctx, trilha.empresa_id);

    const plano: any[] = Array.isArray(trilha.temporada_plano) ? [...trilha.temporada_plano] : [];
    const idx = plano.findIndex((s: any) => s.semana === Number(semana));
    if (idx < 0) throw new Error('Semana não encontrada no plano');

    const { data: colab } = await sb.from('colaboradores')
      .select('cargo, empresa_id, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso')
      .eq('id', trilha.colaborador_id).maybeSingle();
    const { data: empresa } = await sb.from('empresas').select('segmento').eq('id', trilha.empresa_id).maybeSingle();
    const contexto = empresa?.segmento?.toLowerCase().includes('educa') ? 'educacional' : 'corporativo';

    const slot = plano[idx];
    const { callAI } = await import('@/actions/ai-client');
    const competenciaSlot = resolveCompetenciaSlot(trilha, slot);
    // Ficha do cargo: a mesma que o build e o kit usam. Erro de leitura lança
    // e a action devolve o erro, em vez de regerar a semana genérica calada.
    const { carregarFichaCargo } = await import('@/lib/cargo-contexto');
    const fichaCargo = await carregarFichaCargo(sb, trilha.empresa_id, colab?.cargo);

    if (slot.tipo === 'conteudo' && slot.descritor) {
      const { promptDesafio, parseDesafioResponse } = await import('@/lib/season-engine/prompts/challenge');
      const { system, user } = promptDesafio({
        competencia: competenciaSlot,
        descritor: slot.descritor,
        nivel: slot.nivel_atual || 1.5,
        cargo: colab?.cargo, contexto, semana, fichaCargo,
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
      // A complexidade da semana é a que a CONFIG da trilha gravou na geração
      // (R-127): `{4, 8, 12}` fixos valiam só no formato de 14 semanas, e a missão
      // da semana 8 do Onboarding (a última, "completa") saía "intermediária".
      const programaConfig = await resolverConfigDaTrilha(sb, trilha);
      const complexidade = programaConfig.complexidadeMap[semana] || 'intermediario';
      const descritores = slot.descritores_cobertos || [];
      const comps = resolveCompetenciasSlot(trilha, slot);
      const m = promptMissao({
        competencia: competenciaSlot,
        descritores,
        cargo: colab?.cargo,
        contexto,
        missaoTipo: comps.length > 1 ? 'integradora' : 'unica',
        competenciasIntegradas: comps.length > 1 ? comps : undefined,
        fichaCargo,
      });
      const c = promptCenario({
        competencia: competenciaSlot,
        descritores,
        cargo: colab?.cargo,
        contexto,
        complexidade,
        cenarioTipo: comps.length > 1 ? 'integrador' : 'unico',
        competenciasIntegradas: comps.length > 1 ? comps : undefined,
        fichaCargo,
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
    } else if (slot.tipo === 'conteudo') {
      // Era "Semana de avaliação não pode ser regerada" — mensagem enganosa:
      // este ramo é semana de CONTEÚDO sem descritor (a de avaliação cai no else).
      throw new Error('Semana de conteúdo sem descritor definido — sem base pra regerar o desafio');
    } else {
      throw new Error('Semana de avaliação não pode ser regerada');
    }

    // F-I2 (docs/FMEA-PIPELINE.md): regerar também REPARA o conteúdo. Core órfão/
    // stale (dedup, delete, desativação — ou fallback_gerado sem core) é re-selecionado
    // por `selecionarConteudoDaSemana`, a MESMA função do motor — core válido não se
    // troca (a pessoa já viu). E o plano passa por `normalizarSemanas` antes de gravar,
    // como persistirTrilha faz: gravar o JSONB cru perpetuava "título ≠ blocos".
    let reparados = 0;
    if (plano[idx].tipo === 'conteudo') {
      const { repararCoreOrfaoDaSemana } = await import('@/lib/season-engine/build-season');
      const { derivarPrioridadeFormatos } = await import('@/lib/season-engine/formato-preferido');
      reparados = (await repararCoreOrfaoDaSemana(sb, plano[idx], {
        cargo: colab?.cargo,
        prioridadeFormatos: derivarPrioridadeFormatos(colab || {}),
        empresaId: trilha.empresa_id,
      })).reparados;
    }
    normalizarSemanas(plano);

    await updateTrilhaInTenant(sb, trilha.empresa_id, trilhaId, { temporada_plano: plano });

    // Reabre a semana para o conteúdo NOVO — sem apagar o que a pessoa escreveu.
    //
    // Antes gravava `reflexao: null, feedback: null` junto: regerar a semana de quem
    // já tinha respondido destruía o transcript da avaliação, irreversivelmente e sem
    // aviso. O objetivo de regerar é trocar desafio/missão/cenário, não apagar o
    // trabalho de quem já passou por ali.
    //
    // O que se reseta é só o que ficou DESATUALIZADO pelo conteúdo novo: a marca de
    // "já consumi" e os timestamps do ciclo. `reflexao`, `feedback` e `tira_duvidas`
    // ficam intactos.
    const { data: atual } = await sb.from('temporada_semana_progresso')
      .select('reflexao, feedback, tira_duvidas')
      .eq('trilha_id', trilhaId).eq('semana', Number(semana)).maybeSingle();
    const jaTrabalhou = !!(atual?.reflexao || atual?.feedback || atual?.tira_duvidas);

    await updateSemanaProgressoInTenant(sb, trilha.empresa_id, trilhaId, Number(semana), {
      // Quem já respondeu não regride ao status inicial — isso destravaria o
      // Tira-Dúvidas e faria a semana reaparecer como não-feita para quem a concluiu.
      ...(jaTrabalhou ? {} : { status: PROGRESSO.PENDENTE, iniciado_em: null, concluido_em: null }),
      conteudo_consumido: false,
    });

    return {
      message: `Semana ${semana} regerada`
        + (reparados ? ` · ${reparados} conteúdo(s) órfão(s) re-selecionado(s)` : '')
        + (jaTrabalhou ? ' (reflexão/feedback preservados — a pessoa já havia respondido)' : ''),
    };
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
async function aplicarOverlayKit(sb: any, plano: any[], colab: any, trilha: { competencia_foco?: any; competencias_foco?: any; data_inicio?: string | null; programa_modo?: string | null }) {
  if (!colab?.empresa_id || !Array.isArray(plano)) return;
  try {
    const formatoPref = formatoPreferido(colab);
    // Só age em kit marcado `por_preferencia`; sem preferência declarada, a pessoa é tratada como texto + estudo de caso.
    const formatosTop2 = formatosTop2DaPessoa(colab) as Array<'video' | 'audio' | 'texto' | 'case'>;
    const disc = (colab.perfil_dominante || '').charAt(0).toUpperCase() || null;
    const competenciaFoco = trilha.competencia_foco || (Array.isArray(trilha.competencias_foco) ? trilha.competencias_foco[0] : null);
    // Pré-carrega TODOS os kits da trilha em 3 queries (antes: 2-3 queries POR
    // semana = ~30 numa trilha de 14 sem). Consultado em memória no overlay.
    const { precarregarKits } = await import('@/lib/season-engine/kit/entrega-semana');
    // `undefined` (não Map vazio) faz o overlay cair no caminho LIVE, que degrada por
    // semana. O log é o que impede a degradação de ser invisível: o cache falhar
    // significa que a coorte inteira ia perder personalização, e antes disso não
    // deixava rastro nenhum (F-C4).
    const kitsCache = await precarregarKits(sb, { empresaId: colab.empresa_id, disc, cargo: colab.cargo })
      .catch((e: any) => {
        console.error('[overlay] precarregarKits falhou — caindo no resolvedor live:', e?.message);
        return undefined;
      });
    await Promise.all(
      plano.filter((s: any) => s?.tipo === 'conteudo').map((s: any) =>
        overlayKitNaSemana(sb, s, {
          empresaId: colab.empresa_id, disc, cargo: colab.cargo, formatoPref, formatosTop2, competenciaFoco, kitsCache,
          // Jornada: 1 tarefa por semana. Vem do CARIMBO da trilha (não do
          // sys_config atual da empresa) — trocar o modo da empresa não pode
          // mudar a entrega de quem já está no meio de uma trilha.
          desafioUnicoPorCompetencia: getProgramaConfigDaTrilha(trilha).desafioUnicoPorCompetencia,
          // `colaboradorId` é o que LIGA o registro de degradação (entrega-semana.ts).
          // Só passa em semana já liberada: o overlay roda no plano INTEIRO (14
          // semanas) a cada leitura e a cada varredura de admin, e degradação em
          // semana que ninguém pode abrir não é experiência de ninguém.
          // Medido 04/08: 622 de 622 ocorrências eram de semana futura — o alarme
          // "578 fallbacks/24h" era a tela de admin varrendo o futuro. Ver
          // `entregaEhReal`.
          colaboradorId: entregaEhReal(trilha.data_inicio, s.calendario_semana ?? s.semana) ? colab.id : undefined,
        }),
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
      .select('competencia_foco, competencias_foco, temporada_plano, data_inicio, programa_modo')
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

/** Entregas de conteúdo de um plano (DUO via conteudos_dia; single via conteudo). */
function entregasDoPlano(plano: any[]): any[] {
  return (plano || []).flatMap((s: any) => s?.tipo !== 'conteudo' ? []
    : (Array.isArray(s.conteudos_dia) && s.conteudos_dia.length ? s.conteudos_dia : (s.conteudo ? [{ conteudo: s.conteudo }] : [])));
}

/**
 * Anota cada entrega com (a) o DISC de quem o conteúdo servido foi ESCRITO
 * (`disc_do_conteudo` + `vaza_disc`) e (b) se a célula tem VÍDEO pronto (`tem_video`).
 *
 * (a) `montarSemanaConteudo` (build) filtra por competência + cargo mas NÃO por DISC,
 * e enxerga os micro_conteudos do Kit (mesma tabela, com competência/descritor/cargo
 * preenchidos). O overlay só conserta na leitura quando existe kit do DISC da pessoa —
 * com cobertura parcial de DISC, ela lê conteúdo escrito pra outro perfil e ninguém vê.
 *
 * (b) VÍDEO não vive em `formatos_disponiveis` (ver kit/entrega-semana): o week page o
 * resolve AO VIVO por célula (mb do core × cargo × DISC). Sem isto, a tela admin mostra
 * só texto/case e mente sobre o que a pessoa recebe.
 */
async function anotarOrigemDisc(sb: any, items: any[], empresaId: string) {
  try {
    const [{ data: mcs }, { data: vids }] = await Promise.all([
      sb.from('micro_conteudos').select('id, kit_id, modulo_base_id').or(`empresa_id.eq.${empresaId},empresa_id.is.null`),
      sb.from('videos_gerados').select('id, modulo_base_id, cargo, disc_dominante, bunny_video_id, bunny_library').eq('empresa_id', empresaId).eq('status', 'done'),
    ]);
    // O que a pessoa REALMENTE vê é o videos_personalizados (COM saudação nominal);
    // o deck da célula é só o fallback. Espelha resolverCelulaVideo L166-172.
    const cellIds = (vids || []).map((v: any) => v.id);
    const { data: persos } = cellIds.length
      ? await sb.from('videos_personalizados').select('cell_video_id, colaborador_id, bunny_video_id, bunny_library').eq('status', 'done').in('cell_video_id', cellIds)
      : { data: [] as any[] };
    const persoBy = new Map<string, any>((persos || []).map((p: any) => [`${p.cell_video_id}|${p.colaborador_id}`, p]));
    const coreInfo = new Map<string, { kit_id: string | null; mb: string | null }>(
      (mcs || []).map((m: any) => [m.id, { kit_id: m.kit_id || null, mb: m.modulo_base_id || null }]),
    );
    const kitIds = [...new Set((mcs || []).map((m: any) => m.kit_id).filter(Boolean))];
    const { data: kitsRows } = kitIds.length ? await sb.from('kits').select('id, disc').in('id', kitIds) : { data: [] as any[] };
    const discByKit = new Map<string, string>((kitsRows || []).map((k: any) => [k.id, k.disc]));
    const vidCell = new Map<string, any>((vids || []).map((v: any) => [`${v.modulo_base_id}|${v.cargo}|${String(v.disc_dominante || '').toUpperCase()}`, v]));

    for (const t of items) {
      const disc = String(t.colab?.perfil_dominante || '').charAt(0).toUpperCase();
      const cargo = t.colab?.cargo;
      for (const e of entregasDoPlano(t.temporada_plano)) {
        if (!e?.conteudo?.core_id) continue;
        const info = coreInfo.get(e.conteudo.core_id);
        const dc = info?.kit_id ? (discByKit.get(info.kit_id) || null) : null;
        e.conteudo.disc_do_conteudo = dc;
        e.conteudo.vaza_disc = !!dc && !!disc && dc !== disc;
        const vid = info?.mb && cargo && disc ? vidCell.get(`${info.mb}|${cargo}|${disc}`) : null;
        const perso = vid ? persoBy.get(`${vid.id}|${t.colaborador_id}`) : null;
        const fonte = perso || vid; // personalizado (com saudação) > deck da célula
        e.conteudo.tem_video = !!vid;
        e.conteudo.video_personalizado = !!perso; // false = a pessoa vê o deck SEM o nome dela
        e.conteudo.video_embed = fonte?.bunny_video_id && fonte?.bunny_library
          ? `https://iframe.mediadelivery.net/embed/${fonte.bunny_library}/${fonte.bunny_video_id}?autoplay=false&responsive=true`
          : null;
      }
    }
  } catch { /* best-effort — nunca quebra a tela */ }
}

export async function listarTemporadasEmpresa(empresaId: string) {
  try {
    await requireAdminAction();
    if (!empresaId) return { error: 'empresaId obrigatório' };
    const tdb = tenantDb(empresaId);
    const { data, error } = await tdb.from('trilhas')
      .select('id, colaborador_id, competencia_foco, competencias_foco, numero_temporada, status, criado_em, descritores_selecionados, temporada_plano, programa_modo')
      .not('temporada_plano', 'is', null)
      .order('criado_em', { ascending: false });
    if (error) return { error: error.message };

    const ids = (data || []).map((t: any) => t.colaborador_id);
    const { data: colabs } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, empresa_id, perfil_dominante, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso').in('id', ids);
    const colabMap = Object.fromEntries((colabs || []).map((c: any) => [c.id, c]));

    // Client RAW: resolverKitDaSemana usa .or(empresa OR global), incompatível com o
    // wrapper tenant-scoped. Criado 1× e reusado (overlay + anotação de origem).
    const sbRaw = createSupabaseAdmin();
    const items = await Promise.all((data || []).map(async (t: any) => {
      const plano = normalizeTemporadaPlano(t.temporada_plano);
      const colab = colabMap[t.colaborador_id] || null;
      // Overlay do Kit — mostra o conteúdo REAL.
      if (colab) await aplicarOverlayKit(sbRaw, plano, colab, t);
      return { ...t, temporada_plano: plano, colab };
    }));
    await anotarOrigemDisc(sbRaw, items, empresaId);
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
    const ctx = await requireUserAction();
    const sb = createSupabaseAdmin();
    const { data: t } = await sb.from('trilhas').select('empresa_id, colaborador_id, temporada_plano').eq('id', trilhaId).maybeSingle();
    if (!t) return { error: 'Trilha não encontrada' };

    // SÓ O DONO marca o próprio progresso: `trilhaId` vem do CLIENTE, e sem
    // isto qualquer autenticado marca semana como consumida na trilha alheia
    // (de qualquer tenant). Marcar progresso de outro não é caso de uso de
    // ninguém — nem de gestor/RH, que só LEEM a jornada do liderado.
    if (!ctx.colaborador?.id || t.colaborador_id !== ctx.colaborador.id) {
      return { error: 'não autorizado' };
    }
    const { data: existente, error: errLeitura } = await sb.from('temporada_semana_progresso')
      .select('id, status, iniciado_em, conteudo_consumido').eq('trilha_id', trilhaId).eq('semana', semana).maybeSingle();
    // O supabase-js RETORNA `{ error }`. Aqui a leitura NÃO é opcional: o valor
    // atual decide o formato que será gravado (`marcarSemanaConsumida`). Falha
    // silenciosa devolveria `existente = undefined`, o payload viraria `true`
    // cru e sobrescreveria um array de cursos — a destruição exata que esta
    // mudança existe para impedir. Falha alto: é construção de estado, não
    // entrega, e há um humano na tela para retentar.
    if (errLeitura) return { error: `Não consegui ler o progresso da semana: ${errLeitura.message}` };
    const payload = {
      // NÃO é `true` cru: `conteudo_consumido` tem dois escritores com formatos
      // diferentes (aqui boolean, `concluirPilulaSeMapeada` array de cursos) e,
      // até 25/08/2026, cada escrita apagava a da outra. `marcarSemanaConsumida`
      // preserva o formato que já estiver na linha. Hoje é inócuo (0 de 941
      // linhas em array), e é exatamente por isso que dá para arrumar agora.
      conteudo_consumido: marcarSemanaConsumida(existente?.conteudo_consumido, semana),
      // Abrir o conteúdo de uma semana JÁ concluída não a reabre: era
      // `PROGRESSO.EM_ANDAMENTO` fixo, e o gate sequencial trancava a seguinte
      // (3 diretoras de Macaé, set/2026). Ver `statusAoTocarSemana`.
      status: statusAoTocarSemana(existente?.status),
      iniciado_em: existente?.iniciado_em || new Date().toISOString(),
    };
    // Checar a escrita (R-140): sem isto a action devolvia `ok` com a marcação
    // perdida, a tela liberava o Tira-Dúvidas e a primeira pergunta tomava um 403.
    // Falha ALTO, e é seguro: é a própria pessoa tocando num formato, a tela sabe
    // dizer que a abertura não foi registrada e ela pode tentar de novo. NUNCA
    // `ok: true` por um update que não gravou.
    const { error: errGravacao } = existente
      ? await sb.from('temporada_semana_progresso').update(payload).eq('id', existente.id).eq('empresa_id', t.empresa_id)
      : await sb.from('temporada_semana_progresso').insert({
          trilha_id: trilhaId, empresa_id: t.empresa_id, colaborador_id: t.colaborador_id,
          semana,
          tipo: (t.temporada_plano || []).find((s: any) => s.semana === semana)?.tipo || 'conteudo',
          ...payload,
        });
    if (errGravacao) return { error: `Não consegui registrar a abertura do conteúdo: ${errGravacao.message}` };
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
      .select('id, colaborador_id, competencia_foco, competencias_foco, temporada_plano, evolution_report, programa_modo')
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
export async function loadTemporada(colaboradorId: string, opts: { semanaTranscrito?: number; trilhaId?: string; incluirAnterior?: boolean } = {}) {
  try {
    const ctx = await requireUserAction();
    if (!colaboradorId) return { error: 'colaboradorId obrigatório' };

    // Descobre empresa_id do colab pra poder usar tenantDb (que força filtro).
    // Uso raw aqui porque colaboradores busca é a fonte do tenantId.
    const sbRaw = createSupabaseAdmin();
    const { data: colaborador } = await sbRaw.from('colaboradores')
      // `gestor_email`: régua do gate de posse desde 10/08 (F4) — sem ela, nega.
      .select('id, nome_completo, cargo, email, perfil_dominante, empresa_id, area_depto, gestor_email, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso')
      .eq('id', colaboradorId).maybeSingle();
    if (!colaborador?.empresa_id) return { error: 'Colab sem empresa_id' };

    // GATE DE POSSE. O tenantDb abaixo escopa pelo empresa_id DESTE colaborador
    // — que é o que o CLIENTE pediu. Isso garante consistência do escopo, não
    // autorização: sem esta checagem, qualquer autenticado lê a temporada de
    // qualquer pessoa de qualquer tenant, transcripts inclusive. Dono, RH,
    // gestor da área e platform admin passam.
    if (!canViewColabJourney(ctx, colaborador)) return { error: 'não autorizado' };

    // A partir daqui, todas queries em tabelas tenant-owned passam por tenantDb.
    // Se alguém adicionar .from('trilhas').select() sem .eq('empresa_id'),
    // o wrapper garante que o filtro vai.
    const tdb = tenantDb(colaborador.empresa_id);

    let trilhaQuery = tdb.from('trilhas')
      .select('*').eq('colaborador_id', colaboradorId);
    trilhaQuery = opts.trilhaId
      ? trilhaQuery.eq('id', opts.trilhaId)
      : trilhaQuery.order('criado_em', { ascending: false }).limit(1);
    const { data: trilha } = await trilhaQuery.maybeSingle();
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

    // A temporada ANTERIOR concluída (R-16, 03/10/2026). Com o encadeamento, a
    // trilha mais recente passa a ser a jornada seguinte, e o relatório da que
    // acabou de fechar sumia desta tela: só o histórico o abria. Só quando a
    // tela pede, e só se a atual ainda não é ela mesma a concluída.
    let anteriorConcluida: { id: string; numeroTemporada: number; competencia: string } | null = null;
    if (opts.incluirAnterior && trilha.status !== TRILHA.CONCLUIDA && (Number(trilha.numero_temporada) || 1) > 1) {
      const { data: ant, error: errAnt } = await tdb.from('trilhas')
        .select('id, numero_temporada, competencia_foco, competencias_foco')
        .eq('colaborador_id', colaboradorId)
        .eq('status', TRILHA.CONCLUIDA)
        .lt('numero_temporada', trilha.numero_temporada)
        .order('numero_temporada', { ascending: false })
        .limit(1).maybeSingle();
      // Cartão de conveniência: a leitura que falha não derruba a temporada
      // atual, mas também não vira "não há temporada anterior" calada.
      if (errAnt) console.warn('[loadTemporada] temporada anterior (leitura):', errAnt.message);
      else if (ant) {
        anteriorConcluida = {
          id: ant.id,
          numeroTemporada: Number(ant.numero_temporada) || 1,
          competencia: Array.isArray(ant.competencias_foco) && ant.competencias_foco.length > 1
            ? ant.competencias_foco.join(' + ')
            : ant.competencia_foco,
        };
      }
    }

    return {
      ok: true,
      viewerRole: ctx.role,
      trilha: {
        ...trilha,
        temporada_plano: plano,
      },
      progresso: progresso || [],
      colaborador,
      anteriorConcluida,
    };
  } catch (err: any) {
    return { error: err?.message || 'Erro' };
  }
}
