import { task } from '@trigger.dev/sdk';
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { carregarContextoIA2, montarPromptIA2, persistirGabaritoIA2 } from '@/lib/ia2-gabarito';
import { submitClaudeBatch, type BatchReq } from '@/lib/ai-batch';

/**
 * IA2 (gabarito CIS) em LOTE, em BACKGROUND. A tela enfileira (actions/
 * ia-pipeline-batch enqueueIA2Batch cria ia_jobs + dispara esta task) e faz
 * polling de ia_jobs.progress. Roda service-role (SEM gate de request; o
 * isolamento é por tenantDb). Monta 1 request por cargo, submete um único batch
 * Claude (−50%) e persiste cargo a cargo.
 *
 * Resiliência (ajuste combinado):
 *  - Falha POR-ITEM (cargo sem resposta no batch OU persistir ok:false) → registra
 *    o erro em progress.resultados[] e SEGUE (não derruba o lote).
 *  - Falha do BATCH inteiro (submit error) → FALLBACK SÍNCRONO por cargo
 *    (montarPromptIA2 + callAI) — nunca perde conteúdo. Espelha o createAIBatchCollector.
 */
export const gerarIA2BatchTask = task({
  id: 'gerar-ia2-batch',
  maxDuration: 3600, // até 1h (batch async + persistência por cargo)
  run: async (payload: { jobId: string }) => {
    const sb = createSupabaseAdmin();
    const patch = (f: Record<string, unknown>) =>
      sb.from('ia_jobs').update({ ...f, updated_at: new Date().toISOString() }).eq('id', payload.jobId);

    const { data: job } = await sb.from('ia_jobs').select('*').eq('id', payload.jobId).maybeSingle();
    if (!job) throw new Error('ia_job não encontrado: ' + payload.jobId);
    await patch({ status: 'running' });

    try {
      const empresaId: string = job.empresa_id;
      const tdb = tenantDb(empresaId);
      const pp: any = job.params || {};
      const aiConfig = pp.aiConfig || {};
      const cargosAlvo: string[] = Array.isArray(pp.cargos) ? pp.cargos : [];

      // Contexto compartilhado (mesmo gatherer do síncrono) — isolado por tdb.
      const { ctx, error } = await carregarContextoIA2(empresaId, tdb, sb);
      if (error || !ctx) throw new Error(error || 'contexto IA2 indisponível');

      // Só os cargos pedidos pelo job (pendentes no enqueue).
      const alvoSet = new Set(cargosAlvo.map((c) => c.toLowerCase()));
      const entries = Object.entries(ctx.top10PorCargo)
        .filter(([nome]) => !alvoSet.size || alvoSet.has(nome.toLowerCase()));
      const total = entries.length;

      // Modelo do batch: Claude (a UI trava; Batch API é só Claude). No fallback
      // síncrono, callAI recebe o aiConfig como veio (preserva provedor/override).
      const model = String(aiConfig?.model || 'claude-sonnet-4-6');

      // customId seguro (índice) — nomes de cargo têm espaço/acento.
      const items = entries.map(([cargoNome, compNomes], i) => {
        const detalhe = ctx.cargosDetalheMap[cargoNome.toLowerCase()] || {};
        return { customId: `c${i}`, cargoNome, compNomes: compNomes as string[], detalhe };
      });

      const resultados: Array<{ cargo: string; ok: boolean; error?: string; message?: string }> = [];
      let done = 0;
      const pushProgress = (current: string) => patch({ progress: { done, total, current, resultados } });

      await patch({ progress: { done: 0, total, current: `lote (batch) — ${total} cargo(s)…`, resultados: [] } });

      // 1) Submete o batch. Falha total → mapa vazio → cada cargo cai no síncrono.
      let respostas = new Map<string, string>();
      try {
        const reqs: BatchReq[] = items.map((it) => {
          const { system, user } = montarPromptIA2({
            cargoNome: it.cargoNome, compNomes: it.compNomes, detalhe: it.detalhe,
            contextoPPP: ctx.contextoPPP, valores: ctx.valores, empresa: ctx.empresa,
          });
          return { customId: it.customId, system, user, model, maxTokens: 8192 };
        });
        respostas = await submitClaudeBatch(reqs, { budgetMs: 40 * 60_000 });
      } catch (e: any) {
        console.warn(`[gerar-ia2-batch] batch falhou (${e?.message}) — fallback síncrono por cargo`);
      }

      // 2) Processa cargo a cargo: resposta do batch OU fallback síncrono; persiste.
      const { callAI } = await import('@/actions/ai-client');
      const { extractJSON } = await import('@/actions/utils');
      for (const it of items) {
        let texto = respostas.get(it.customId);
        if (!texto || !texto.trim()) {
          // Sem resposta no batch (falha total OU request específico) → síncrono.
          try {
            const { system, user } = montarPromptIA2({
              cargoNome: it.cargoNome, compNomes: it.compNomes, detalhe: it.detalhe,
              contextoPPP: ctx.contextoPPP, valores: ctx.valores, empresa: ctx.empresa,
            });
            texto = await callAI(system, user, aiConfig, 8192);
          } catch (e: any) {
            resultados.push({ cargo: it.cargoNome, ok: false, error: 'IA falhou: ' + (e?.message || e) });
            done++;
            await pushProgress(`cargo ${it.cargoNome}: erro de IA`);
            continue;
          }
        }

        const resultado = await extractJSON(texto);
        const r = await persistirGabaritoIA2({
          tdb, cargoNome: it.cargoNome, resultado, detalhe: it.detalhe, colabsParaMetrica: ctx.colabsParaMetrica,
        });
        resultados.push({ cargo: it.cargoNome, ok: r.ok, error: r.error, message: r.message });
        done++;
        await pushProgress(`cargo ${it.cargoNome}: ${r.ok ? 'ok' : 'erro'}`);
      }

      const okCount = resultados.filter((r) => r.ok).length;
      const errCount = resultados.length - okCount;
      await patch({
        status: 'done',
        error: null,
        result_ids: resultados.filter((r) => r.ok).map((r) => r.cargo),
        progress: { done: total, total, current: `concluído: ${okCount} ok, ${errCount} erro(s)`, resultados },
      });
      return { ok: true, jobId: payload.jobId, okCount, errCount };
    } catch (e: any) {
      await patch({ status: 'error', error: String(e?.message || e).slice(0, 500) });
      throw e;
    }
  },
});
