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
import type { AIConfig } from '@/actions/ai-client';
import { listarCargosParaIA2 } from '@/actions/fase1';
import type { gerarIA2BatchTask } from '@/trigger/gerar-ia2-batch';

/**
 * Cria o job em `ia_jobs` com os cargos PENDENTES (sem gabarito) e dispara a task
 * de lote. O gate de tenant fica AQUI (requireEmpresaSupabase); a task roda
 * service-role sem gate de request. Retorna o jobId p/ polling.
 */
export async function enqueueIA2Batch(empresaId: string, aiConfig: AIConfig = {}) {
  try {
    if (!empresaId) return { success: false as const, error: 'empresaId obrigatório' };
    const sb = await requireEmpresaSupabase(empresaId, 'ai.audit.regenerate');

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
