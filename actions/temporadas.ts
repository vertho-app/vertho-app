'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail, canViewColabJourney } from '@/lib/authz';
import { selectDescriptorsPiloto } from '@/lib/season-engine/select-descriptors';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';
import { entregaEhReal } from '@/lib/season-engine/week-gating';
import { overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';
import { getProgramaConfigByModo, getProgramaConfigDaTrilha, resolverModoColab } from '@/lib/season-engine/programa-config';
import { parseProgramaCustom, derivarConfigCustom } from '@/lib/season-engine/programa-custom';
import { gerarTemporadaCoreHeadless, normalizarSemanas } from '@/lib/season-engine/trilha-core';
import type { AIConfig } from './ai-client';
import { z } from 'zod';
import { requireAdminAction, requireUserAction, getAuthenticatedEmailFromAction, assertTenantAccessAction } from '@/lib/auth/action-context';
import { protectedAction, DomainError } from '@/lib/auth/protected-action';
import { findTrilhaComTenant, updateTrilhaInTenant, updateSemanaProgressoInTenant } from '@/lib/repositories/trilhas-repo';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { PROGRESSO, TRILHA } from '@/lib/status';
import { marcarSemanaConsumida } from '@/lib/season-engine/consumo-conteudo';

interface GerarTemporadaParams {
  colaboradorId?: string;
  competencia?: string;
  aiConfig?: AIConfig;
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
    // cobre quem RESOLVERIA pra degustação na geração (fonte única de
    // precedência): 'piloto' (preset) OU 'custom' (builder).
    const modoPorColab = new Map<string, string>(
      (todosColabs as any[]).map(c => [c.id, resolverModoColab(c, empresa?.sys_config)]),
    );
    const colabs = (todosColabs as any[]).filter(
      c => modoPorColab.get(c.id) === 'piloto' || modoPorColab.get(c.id) === 'custom',
    );
    if (!colabs.length) {
      throw new Error(`Nenhum colaborador resolveria pra piloto/personalizado (default da empresa: ${empresa?.sys_config?.programa_modo || 'regular DUO'}; nenhum override individual). Marque colaboradores em Configurações → Equipe ou mude o default do Programa.`);
    }
    const configPiloto = getProgramaConfigByModo('piloto');
    // Config do modo custom (builder) — derivada uma vez do sys_config da
    // empresa. Inválida/ausente → bloqueador por colaborador custom (abaixo).
    const inputsCustom = parseProgramaCustom(empresa?.sys_config?.programa_custom);
    const configCustom = inputsCustom ? derivarConfigCustom(inputsCustom) : null;

    // Cenários B disponíveis por cargo (fechamento)
    const { data: cenariosB } = await tdb.from('banco_cenarios')
      .select('cargo').eq('tipo_cenario', 'cenario_b');
    const cargosComCenarioB = new Set((cenariosB || []).map((c: any) => c.cargo));

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
      const cfg = modoColab === 'custom' ? configCustom : configPiloto;
      if (!cfg) {
        resultados.push({ colaborador: colab.nome_completo, pronto: false, bloqueadores: ['Modo Personalizado sem configuração válida (sys_config.programa_custom) — defina em Configurações → Programa'] });
        continue;
      }

      // Competência âncora — MESMA resolução da geração (trilha → cargo)
      const comp: string | undefined = compPorColab.get(colab.id) || (colab.cargo ? compPorCargo.get(colab.cargo) : undefined);
      if (!comp) {
        resultados.push({ colaborador: colab.nome_completo, pronto: false, bloqueadores: ['Sem competência foco resolvível (trilha/cargo)'] });
        continue;
      }

      // Custom com 2 comps: cada semana leva 1 descritor POR comp — na âncora o
      // esperado é 1/semana. Piloto/custom-single: conteudosPorSemana da mesma comp.
      const duasComps = (cfg.numCompetencias || 1) >= 2;
      const porSemana = duasComps ? 1 : (cfg.conteudosPorSemana || 2);
      const esperado = (cfg.slotsConteudo?.length || 2) * porSemana;

      const assessment = assessmentsPorColabComp.get(`${colab.id}|${comp}`) || [];
      const top = selectDescriptorsPiloto(comp, assessment, cfg.slotsConteudo, porSemana);

      const bloqueadores: string[] = [];
      const avisos: string[] = [];
      if (duasComps) {
        avisos.push('2 competências: a prontidão verifica a comp âncora; sem a 2ª viável, a geração degrada pra 1 comp (não bloqueia)');
      }
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

      // Fechamento: cenário B do cargo (a rota busca cargo do colab || 'todos').
      // Modo SEM fechamento (custom, semanasAvaliacao=[]) não precisa de Cenário B.
      if (cfg.semanasAvaliacao.length > 0
          && !cargosComCenarioB.has(colab.cargo || 'todos') && !cargosComCenarioB.has('todos')) {
        bloqueadores.push(`Fechamento sem Cenário B pro cargo "${colab.cargo || 'todos'}" — gere na Fase 5 (Cenários B em lote)`);
      }

      resultados.push({
        colaborador: colab.nome_completo,
        cargo: colab.cargo,
        competencia: comp,
        modo: modoColab,
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
      'id, colaborador_id, empresa_id, competencia_foco, competencias_foco, temporada_plano, descritores_selecionados',
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
          empresaId: colab.empresa_id, disc, cargo: colab.cargo, formatoPref, competenciaFoco, kitsCache,
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
      .select('id, iniciado_em, conteudo_consumido').eq('trilha_id', trilhaId).eq('semana', semana).maybeSingle();
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
export async function loadTemporada(colaboradorId: string, opts: { semanaTranscrito?: number } = {}) {
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
    // gestor da área, tutor do tutorado e platform admin passam.
    if (!canViewColabJourney(ctx, colaborador)) return { error: 'não autorizado' };

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
