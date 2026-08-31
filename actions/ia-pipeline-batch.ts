'use server';

/**
 * IA2 em LOTE (Anthropic Batch API, −50%) — alternativa assíncrona ao runner
 * síncrono do pipeline (page.tsx roda `rodarIA2` por cargo). Enfileira um job em
 * `ia_jobs`, dispara a task `gerar-ia2-batch` e a tela faz polling de `progress`.
 * Espelha o padrão do Kit Semanal (actions/kits: enqueueKit/statusKit).
 */
import { tasks, runs } from '@trigger.dev/sdk';
import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { regionOpts } from '@/lib/trigger-region';
import { tenantDb } from '@/lib/tenant-db';
import type { AIConfig } from '@/actions/ai-client';
import { listarCargosParaIA2, listarFilaIA3 } from '@/actions/fase1';
import { listarPendentesIA4 } from '@/actions/fase3';
import { listarPendentesCheckCore } from '@/lib/check-ia4-core';
import { resolverFilaBlueprint100, separarPorBlueprintExistente } from '@/lib/blueprint/core';
import type { gerarIA2BatchTask } from '@/trigger/gerar-ia2-batch';
import type { gerarIA3BatchTask } from '@/trigger/gerar-ia3-batch';
import type { gerarIA4BatchTask } from '@/trigger/gerar-ia4-batch';
import type { gerarBlueprintBatchTask } from '@/trigger/gerar-blueprint-batch';
import type { gerarRelatoriosBatchTask } from '@/trigger/gerar-relatorios-batch';
import { gerarRelatoriosIndividuaisLote } from '@/actions/relatorios';

/**
 * Guard anti-duplicata: um lote POR FASE por empresa. Lotes de fases
 * DIFERENTES rodam em paralelo (a UI agora libera o runner após enfileirar);
 * dois lotes da MESMA fase processariam a mesma fila em corrida.
 */
async function jaTemLoteAtivo(sb: any, empresaId: string, fase: string): Promise<string | null> {
  const { data } = await sb.from('ia_jobs')
    .select('id')
    .eq('empresa_id', empresaId).eq('fase', fase)
    .in('status', ['queued', 'running'])
    .limit(1).maybeSingle();
  return data?.id || null;
}

/**
 * Lotes ATIVOS da empresa (queued/running) — a tela re-adota o acompanhamento
 * ao carregar (o job vive no Trigger; fechar/recarregar a página não o perde).
 */
export async function listarJobsAtivosIA(empresaId: string) {
  try {
    if (!empresaId) return [];
    const sb = await requireEmpresaSupabase(empresaId, 'ai.audit.regenerate', 'listarJobsAtivosIA');
    const { data } = await sb.from('ia_jobs')
      .select('id, fase, status, progress, created_at')
      .eq('empresa_id', empresaId)
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: false });
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Cria o job em `ia_jobs` com os cargos PENDENTES (sem gabarito) e dispara a task
 * de lote. O gate de tenant fica AQUI (requireEmpresaSupabase); a task roda
 * service-role sem gate de request. Retorna o jobId p/ polling.
 */
export async function enqueueIA2Batch(empresaId: string, aiConfig: AIConfig = {}) {
  try {
    if (!empresaId) return { success: false as const, error: 'empresaId obrigatório' };
    const sb = await requireEmpresaSupabase(empresaId, 'ai.audit.regenerate', 'enqueueIA2Batch');
    const dup = await jaTemLoteAtivo(sb, empresaId, 'ia2');
    if (dup) return { success: false as const, error: `Já existe um lote de IA2 em andamento (${dup.slice(0, 8)}…) — aguarde ou cancele antes de disparar outro.` };

    // Cargos pendentes (só os sem gabarito) — mesma fonte do runner síncrono.
    const { cargos } = await listarCargosParaIA2(empresaId);
    const pendentes = (cargos || []).filter((c) => !c.jaTem).map((c) => c.nome);
    if (!pendentes.length) {
      return { success: true as const, jobId: null, total: 0, message: 'nada pendente' };
    }

    const { data: job, error } = await sb.from('ia_jobs').insert({
      empresa_id: empresaId,
      fase: 'ia2',
      params: { aiConfig, cargos: pendentes },
      status: 'queued',
      progress: { done: 0, total: pendentes.length, current: 'na fila', resultados: [] },
    }).select('id').single();
    if (error) return { success: false as const, error: error.message };

    try {
      const handle = await tasks.trigger<typeof gerarIA2BatchTask>('gerar-ia2-batch', { jobId: job.id }, regionOpts());
      // Guarda o runId p/ o cancel best-effort (sem coluna dedicada; vive em params).
      await sb.from('ia_jobs').update({ params: { aiConfig, cargos: pendentes, runId: handle.id } }).eq('id', job.id);
    } catch (e: any) {
      await sb.from('ia_jobs').update({ status: 'error', error: 'dispatch: ' + (e?.message || e) }).eq('id', job.id);
      return { success: false as const, error: 'Não foi possível enfileirar: ' + (e?.message || e) };
    }

    return { success: true as const, jobId: job.id, total: pendentes.length };
  } catch (err: any) {
    return { success: false as const, error: err?.message || 'Erro' };
  }
}

/**
 * IA3 (cenários A + check dual) em LOTE — Claude −50% na geração, OpenAI −50%
 * no check quando o modelo é gpt-*. Enfileira a fila do IA3 (mesma fonte do
 * runner síncrono: pendentes; se tudo já gerado, regenera tudo) e dispara a
 * task `gerar-ia3-batch`. Gate de tenant AQUI; a task roda service-role.
 */
export async function enqueueIA3Batch(empresaId: string, aiConfig: AIConfig & { checkModel?: string } = {}) {
  try {
    if (!empresaId) return { success: false as const, error: 'empresaId obrigatório' };
    const sb = await requireEmpresaSupabase(empresaId, 'ai.audit.regenerate', 'enqueueIA3Batch');
    const dup = await jaTemLoteAtivo(sb, empresaId, 'ia3');
    if (dup) return { success: false as const, error: `Já existe um lote de IA3 em andamento (${dup.slice(0, 8)}…) — aguarde ou cancele antes de disparar outro.` };

    const fila = await listarFilaIA3(empresaId);
    if (!fila?.success || !fila.data?.length) {
      return { success: false as const, error: fila?.error || 'Nenhuma competência na fila do IA3' };
    }
    // Mesma seleção do runner síncrono: pendentes primeiro; tudo gerado → todos.
    const pendentes = fila.data.filter((f: any) => !f.jaGerado);
    const escolhidos = pendentes.length ? pendentes : fila.data;
    const items = escolhidos.map((f: any) => ({
      cargo: f.cargo, competencia_id: f.competencia_id,
      ppp_escola_id: f.ppp_escola_id ?? null, nome: f.nome,
    }));

    const { data: job, error } = await sb.from('ia_jobs').insert({
      empresa_id: empresaId,
      fase: 'ia3',
      params: { aiConfig, items },
      status: 'queued',
      progress: { done: 0, total: items.length * (aiConfig?.checkModel ? 2 : 1), current: 'na fila', resultados: [] },
    }).select('id').single();
    if (error) return { success: false as const, error: error.message };

    try {
      const handle = await tasks.trigger<typeof gerarIA3BatchTask>('gerar-ia3-batch', { jobId: job.id }, regionOpts());
      await sb.from('ia_jobs').update({ params: { aiConfig, items, runId: handle.id } }).eq('id', job.id);
    } catch (e: any) {
      await sb.from('ia_jobs').update({ status: 'error', error: 'dispatch: ' + (e?.message || e) }).eq('id', job.id);
      return { success: false as const, error: 'Não foi possível enfileirar: ' + (e?.message || e) };
    }

    return { success: true as const, jobId: job.id, total: items.length };
  } catch (err: any) {
    return { success: false as const, error: err?.message || 'Erro' };
  }
}

/**
 * IA4 (avaliação das respostas + check dual) em LOTE — Claude −50% na avaliação,
 * OpenAI −50% no check. Enfileira a fila da IA4 (mesma fonte do runner síncrono,
 * incluindo as "presas" do achado 1.4) e dispara `gerar-ia4-batch`.
 *
 * Inclui `checkOnlyIds`: avaliações que JÁ existem e nunca passaram pela 2ª IA.
 * Sem isso o lote repetiria o buraco da tela — um lote interrompido no meio
 * deixa avaliação pronta sem check, e nada mais alcança essas respostas
 * (aconteceu em 11/08: 58 de 72 ficaram assim quando a action estourou 300 s).
 */
export async function enqueueIA4Batch(
  empresaId: string,
  aiConfig: AIConfig & { checkModel?: string } = {},
  // Escopo de turma (mig 210). ⚠️ Este é o caminho que RODA: o lote virou o
  // default em 12/08. Escopar só o síncrono deixaria o fail-closed contornável
  // pelo botão que o operador realmente usa.
  opts?: { turmaId?: string | null; empresaInteiraJustificativa?: string },
) {
  try {
    if (!empresaId) return { success: false as const, error: 'empresaId obrigatório' };
    const sb = await requireEmpresaSupabase(empresaId, 'ai.audit.regenerate', 'enqueueIA4Batch');
    const dup = await jaTemLoteAtivo(sb, empresaId, 'ia4');
    if (dup) return { success: false as const, error: `Já existe um lote de IA4 em andamento (${dup.slice(0, 8)}…) — aguarde ou cancele antes de disparar outro.` };

    const fila = await listarPendentesIA4(empresaId, opts);
    if (!fila?.success) return { success: false as const, error: fila?.error || 'Não foi possível listar a fila da IA4' };
    const items = (fila.data || []).map((r: any) => ({ id: r.id }));

    let checkOnlyIds: string[] = [];
    if (aiConfig?.checkModel) {
      const pend = await listarPendentesCheckCore(sb, empresaId);
      const jaNaFila = new Set(items.map((i) => i.id));
      checkOnlyIds = (pend.data || []).map((p: any) => p.id).filter((id: string) => !jaNaFila.has(id));
    }

    if (!items.length && !checkOnlyIds.length) {
      return { success: true as const, jobId: null, total: 0, message: 'nada pendente' };
    }

    const total = items.length * (aiConfig?.checkModel ? 2 : 1) + checkOnlyIds.length;
    const { data: job, error } = await sb.from('ia_jobs').insert({
      empresa_id: empresaId,
      fase: 'ia4',
      params: { aiConfig, items, checkOnlyIds },
      status: 'queued',
      progress: { done: 0, total, current: 'na fila', resultados: [] },
    }).select('id').single();
    if (error) return { success: false as const, error: error.message };

    try {
      const handle = await tasks.trigger<typeof gerarIA4BatchTask>('gerar-ia4-batch', { jobId: job.id }, regionOpts());
      await sb.from('ia_jobs').update({ params: { aiConfig, items, checkOnlyIds, runId: handle.id } }).eq('id', job.id);
    } catch (e: any) {
      await sb.from('ia_jobs').update({ status: 'error', error: 'dispatch: ' + (e?.message || e) }).eq('id', job.id);
      return { success: false as const, error: 'Não foi possível enfileirar: ' + (e?.message || e) };
    }

    return { success: true as const, jobId: job.id, total: items.length, checkOnly: checkOnlyIds.length };
  } catch (err: any) {
    return { success: false as const, error: err?.message || 'Erro' };
  }
}

/**
 * Development Blueprint em LOTE (Batch API, −50%). Enfileira um job com a FILA
 * 100% (colabs com todas as competências foco mapeadas) e dispara a task
 * `gerar-blueprint-batch`. Gate de tenant AQUI; a task roda service-role.
 */
export async function enqueueBlueprintBatch(
  empresaId: string,
  aiConfig: AIConfig = {},
  /**
   * `regerar: true` inclui quem JÁ TEM blueprint (o comportamento anterior, que
   * era o único). Fica como escolha explícita de quem tem
   * `ai.audit.regenerate` — não é bypass de gate, é intenção: regerar por cima
   * de blueprint auditado e já virado PDI precisa ser um ato deliberado, nunca
   * o default de um botão chamado "gerar".
   */
  opts: { regerar?: boolean } = {},
) {
  try {
    if (!empresaId) return { success: false as const, error: 'empresaId obrigatório' };
    const sb = await requireEmpresaSupabase(empresaId, 'ai.audit.regenerate', 'enqueueBlueprintBatch');
    const dup = await jaTemLoteAtivo(sb, empresaId, 'blueprint');
    if (dup) return { success: false as const, error: `Já existe um lote de Blueprints em andamento (${dup.slice(0, 8)}…) — aguarde ou cancele antes de disparar outro.` };
    const tdb = tenantDb(empresaId);

    const fila = await resolverFilaBlueprint100(tdb);
    if (!fila.length) {
      return { success: true as const, jobId: null, total: 0, message: 'Nenhum colaborador com as competências foco 100% mapeadas' };
    }

    // Elegível ≠ pendente. Ver `separarPorBlueprintExistente`: o persist é
    // upsert, então incluir quem já tem SOBRESCREVE blueprint auditado — e,
    // em Macaé, 34 deles já viraram PDI entregue.
    const { pendentes, jaTem } = await separarPorBlueprintExistente(tdb, fila);
    const alvo = opts.regerar ? fila : pendentes;
    if (!alvo.length) {
      return {
        success: true as const, jobId: null, total: 0, pulados: jaTem.length,
        message: `Todos os ${jaTem.length} elegíveis já têm blueprint. Use "regerar" para refazê-los.`,
      };
    }
    const colabIds = alvo.map((c) => c.id);

    const { data: job, error } = await sb.from('ia_jobs').insert({
      empresa_id: empresaId,
      fase: 'blueprint',
      params: { aiConfig, colabIds },
      status: 'queued',
      progress: { done: 0, total: colabIds.length, current: 'na fila', resultados: [] },
    }).select('id').single();
    if (error) return { success: false as const, error: error.message };

    try {
      const handle = await tasks.trigger<typeof gerarBlueprintBatchTask>('gerar-blueprint-batch', { jobId: job.id }, regionOpts());
      await sb.from('ia_jobs').update({ params: { aiConfig, colabIds, runId: handle.id } }).eq('id', job.id);
    } catch (e: any) {
      await sb.from('ia_jobs').update({ status: 'error', error: 'dispatch: ' + (e?.message || e) }).eq('id', job.id);
      return { success: false as const, error: 'Não foi possível enfileirar: ' + (e?.message || e) };
    }
    // `pulados` sobe para a tela: um lote que encolhe de 81 para 43 sem dizer
    // por quê é indistinguível de uma fila que encolheu sozinha.
    return { success: true as const, jobId: job.id, total: colabIds.length, pulados: opts.regerar ? 0 : jaTem.length };
  } catch (err: any) {
    return { success: false as const, error: err?.message || 'Erro' };
  }
}

/**
 * PDI (relatório individual) em LOTE (Batch API, −50%).
 *
 * 🔴 POR QUE ENTROU (31/08/2026): o PDI era o único da família sem lote. A tela
 * montava a fila e iterava chamando a action uma vez por pessoa — e Server
 * Action é despachada UMA POR VEZ por cliente, então a aba ficava presa do
 * começo ao fim. Medido em 78 gerações reais: 59s de média, p90 de 70s. Para os
 * 43 professores de Macaé isso é ~45 min de aba aberta.
 *
 * O desconto de 50% é o menor dos ganhos (US$ 1,40 em 43 PDIs); o que o lote
 * resolve é a aba — e a retomada, que no laço do cliente dependia de a pessoa
 * não fechar a janela.
 *
 * 🔑 A FILA É A MESMA de `gerarRelatoriosIndividuaisLote`, importada em vez de
 * reescrita. Ela carrega duas regras que custaram caro: pula quem JÁ TEM
 * relatório (o upsert sobrescreveria PDI entregue) e exige avaliação COMPLETA
 * do top5 do cargo (antes, 1 de 2 competências gerava um PDI capado). Uma
 * segunda fila aqui seria o gêmeo que diverge na primeira correção.
 */
export async function enqueueRelatoriosBatch(empresaId: string, aiConfig: AIConfig = {}) {
  try {
    if (!empresaId) return { success: false as const, error: 'empresaId obrigatório' };
    const sb = await requireEmpresaSupabase(empresaId, 'ai.audit.regenerate', 'enqueueRelatoriosBatch');
    const dup = await jaTemLoteAtivo(sb, empresaId, 'relatorios');
    if (dup) return { success: false as const, error: `Já existe um lote de PDIs em andamento (${dup.slice(0, 8)}…) — aguarde ou cancele antes de disparar outro.` };

    const fila = await gerarRelatoriosIndividuaisLote(empresaId);
    if (!fila?.success) return { success: false as const, error: fila?.error || 'Falha ao montar a fila' };
    const colabIds = fila.data || [];
    if (!colabIds.length) {
      return { success: true as const, jobId: null, total: 0, message: fila.message || 'Nada pendente' };
    }

    const { data: job, error } = await sb.from('ia_jobs').insert({
      empresa_id: empresaId,
      fase: 'relatorios',
      params: { aiConfig, colabIds },
      status: 'queued',
      progress: { done: 0, total: colabIds.length, current: 'na fila', resultados: [] },
    }).select('id').single();
    if (error) return { success: false as const, error: error.message };

    try {
      const handle = await tasks.trigger<typeof gerarRelatoriosBatchTask>('gerar-relatorios-batch', { jobId: job.id }, regionOpts());
      // O supabase-js RETORNA `{ error }`. Aqui a falha NÃO pode derrubar a
      // action: a task já foi disparada e vai gerar (e cobrar). Dizer "não foi
      // possível enfileirar" faria a pessoa clicar de novo e pagar duas vezes.
      // O que se perde é o `runId`, usado só pelo cancel best-effort — degrada
      // registrando, que é a régua da ENTREGA.
      const { error: errRun } = await sb.from('ia_jobs')
        .update({ params: { aiConfig, colabIds, runId: handle.id } }).eq('id', job.id);
      if (errRun) console.error(`[enqueueRelatoriosBatch] runId ${handle.id} NÃO persistido no job ${job.id}: ${errRun.message} — o lote roda, mas o cancel pela tela não acha o run`);
    } catch (e: any) {
      // Se ESTE update falhar, o job fica 'queued' para sempre e o guard
      // anti-duplicata passa a barrar todo lote futuro de PDI desta empresa.
      // Não há a quem propagar (já estamos no catch), então o registro é o
      // único rastro — e ele precisa dizer o que destrava.
      const { error: errMarca } = await sb.from('ia_jobs')
        .update({ status: 'error', error: 'dispatch: ' + (e?.message || e) }).eq('id', job.id);
      if (errMarca) console.error(`[enqueueRelatoriosBatch] job ${job.id} ficou preso em 'queued' (falha ao marcar erro: ${errMarca.message}) — cancelar na tela para liberar novos lotes`);
      return { success: false as const, error: 'Não foi possível enfileirar: ' + (e?.message || e) };
    }
    return { success: true as const, jobId: job.id, total: colabIds.length, message: fila.message };
  } catch (err: any) {
    return { success: false as const, error: err?.message || 'Erro' };
  }
}

/** Status do job (polling da tela). */
export async function statusIAJob(jobId: string) {
  try {
    const sb = await requireAdminSupabase('ai.audit.regenerate');
    const { data } = await sb.from('ia_jobs')
      .select('id, status, progress, result_ids, error, updated_at')
      .eq('id', jobId).maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

/** Cancela o job: marca 'cancelled' e tenta abortar o run (best-effort). */
export async function cancelIAJob(jobId: string) {
  try {
    const sb = await requireAdminSupabase('ai.audit.regenerate');
    if (!jobId) return { success: false as const, error: 'jobId obrigatório' };

    const { data: job } = await sb.from('ia_jobs').select('params').eq('id', jobId).maybeSingle();
    await sb.from('ia_jobs').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', jobId);

    const runId = (job?.params as any)?.runId;
    if (runId) {
      try { await runs.cancel(runId); } catch { /* run já terminou / indisponível */ }
    }
    return { success: true as const };
  } catch (err: any) {
    return { success: false as const, error: err?.message || 'Erro' };
  }
}
