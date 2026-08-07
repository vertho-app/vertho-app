import { task } from '@trigger.dev/sdk';
import { createSupabaseAdmin } from '@/lib/supabase';
import { buildBlueprintReq, persistBlueprintFromText } from '@/lib/blueprint/core';
import { submitClaudeBatch, type BatchReq } from '@/lib/ai-batch';

/**
 * Development Blueprint em LOTE, em BACKGROUND. A tela enfileira
 * (actions/ia-pipeline-batch::enqueueBlueprintBatch cria ia_jobs + dispara esta
 * task) e faz polling de ia_jobs.progress. Roda service-role (SEM gate de request;
 * o isolamento é por buildBlueprintReq com empresaIdEsperado). Monta 1 request por
 * colaborador da FILA 100% (todas as foco mapeadas), submete um único batch Claude
 * (−50%) e persiste colab a colab.
 *
 * Resiliência (espelha o gerar-ia2-batch):
 *  - Falha POR-ITEM (colab sem resposta OU persist ok:false) → registra e SEGUE.
 *  - Falha do BATCH inteiro → FALLBACK SÍNCRONO por colab (callAI) — nunca perde.
 */
export const gerarBlueprintBatchTask = task({
  id: 'gerar-blueprint-batch',
  maxDuration: 3600, // até 1h (batch async + persistência por colab)
  run: async (payload: { jobId: string }) => {
    const sb = createSupabaseAdmin();
    const patch = (f: Record<string, unknown>) =>
      sb.from('ia_jobs').update({ ...f, updated_at: new Date().toISOString() }).eq('id', payload.jobId);

    const { data: job } = await sb.from('ia_jobs').select('*').eq('id', payload.jobId).maybeSingle();
    if (!job) throw new Error('ia_job não encontrado: ' + payload.jobId);
    await patch({ status: 'running' });

    try {
      const empresaId: string = job.empresa_id;
      const pp: any = job.params || {};
      const aiConfig = pp.aiConfig || {};
      const colabIds: string[] = Array.isArray(pp.colabIds) ? pp.colabIds : [];
      const total = colabIds.length;
      const model = String(aiConfig?.model || 'claude-sonnet-4-6');

      const resultados: Array<{ colab: string; ok: boolean; error?: string }> = [];
      let done = 0;
      const pushProgress = (current: string) => patch({ progress: { done, total, current, resultados } });
      await patch({ progress: { done: 0, total, current: `lote (batch) — ${total} blueprint(s)…`, resultados: [] } });

      // Nomes (pro progress legível).
      const { data: colabs } = await sb.from('colaboradores').select('id, nome_completo').in('id', colabIds).eq('empresa_id', empresaId);
      const nomeById = new Map<string, string>((colabs || []).map((c: any) => [c.id, c.nome_completo]));
      const nome = (id: string) => nomeById.get(id) || id;

      // 1) Monta os requests (buildBlueprintReq por colab; aplica o gate 100%).
      const reqs: BatchReq[] = [];
      const meta = new Map<string, { competenciasFoco: any[] }>();
      const buildErr = new Set<string>();
      for (const id of colabIds) {
        const r = await buildBlueprintReq(sb, { colaboradorId: id, empresaIdEsperado: empresaId });
        if ('error' in r) { resultados.push({ colab: nome(id), ok: false, error: r.error }); buildErr.add(id); continue; }
        reqs.push({ customId: id, system: r.system, user: r.user, model, maxTokens: r.maxTokens });
        meta.set(id, { competenciasFoco: r.competenciasFoco });
      }

      // 2) Submete o batch. Falha total → mapa vazio → cada colab cai no síncrono.
      let respostas = new Map<string, string>();
      if (reqs.length) {
        try { respostas = await submitClaudeBatch(reqs, { budgetMs: 40 * 60_000 }); }
        catch (e: any) { console.warn(`[gerar-blueprint-batch] batch falhou (${e?.message}) — fallback síncrono por colab`); }
      }

      // 3) Persiste colab a colab: resposta do batch OU fallback síncrono.
      const { callAI } = await import('@/actions/ai-client');
      for (const id of colabIds) {
        done++;
        if (buildErr.has(id)) { await pushProgress(`${nome(id)}: mapeamento incompleto`); continue; }
        const m = meta.get(id)!;
        const req = reqs.find((r) => r.customId === id)!;
        let texto = respostas.get(id);
        if (!texto || !texto.trim()) {
          try {
            texto = await callAI(req.system, req.user, aiConfig, req.maxTokens, {
              taskKey: 'blueprint_gerar', empresaId, source: 'batch-sync',
            });
          }
          catch (e: any) { resultados.push({ colab: nome(id), ok: false, error: 'IA falhou: ' + (e?.message || e) }); await pushProgress(`${nome(id)}: erro de IA`); continue; }
        }
        const r = await persistBlueprintFromText(empresaId, id, m.competenciasFoco, texto);
        resultados.push({ colab: nome(id), ok: !!r.ok, error: r.error });
        await pushProgress(`${nome(id)}: ${r.ok ? 'ok' : 'erro'}`);
      }

      const okCount = resultados.filter((r) => r.ok).length;
      const errCount = resultados.length - okCount;
      await patch({
        status: 'done', error: null,
        result_ids: resultados.filter((r) => r.ok).map((r) => r.colab),
        progress: { done: total, total, current: `concluído: ${okCount} ok, ${errCount} erro(s)`, resultados },
      });
      return { ok: true, jobId: payload.jobId, okCount, errCount };
    } catch (e: any) {
      await patch({ status: 'error', error: String(e?.message || e).slice(0, 500) });
      throw e;
    }
  },
});
