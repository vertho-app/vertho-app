import { task, wait } from '@trigger.dev/sdk';
import { criarPatchJob, registrarFalhaDaTentativa } from '@/lib/ia-jobs';
import { createSupabaseAdmin } from '@/lib/supabase';
import { buildBlueprintReq, persistBlueprintFromText } from '@/lib/blueprint/core';
import {
  createClaudeBatch, pollClaudeBatch, fetchClaudeBatchResults,
  encerrarBatch, batchPendenteDoJob, type BatchReq,
} from '@/lib/ai-batch';
import { IA_BATCH } from '@/lib/status';

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
 *
 * ── C3 (auditoria 22/08), passo 4 — 24/08 ──────────────────────────────────
 *
 * Esta task ficou por ÚLTIMO de propósito, e o motivo está na linha acima: o
 * fallback síncrono é declarado como FEATURE ("nunca perde"). Isso muda o custo
 * de um retry mal colocado — aqui ele não só resubmete o lote, ele ainda paga o
 * caminho caro por cima. Era a task onde ligar `retry` primeiro seria mais
 * errado, então virou a última a receber os pré-requisitos.
 *
 * O que mudou (o mesmo do manuscrito/IA2/IA3/IA4):
 *  1. batch DESTACADO — `createClaudeBatch` + `batchId` persistido ANTES do
 *     polling, com `wait.for` checkpointado. Era `submitClaudeBatch`, que cria e
 *     espera dentro da run, deixando o id só em memória;
 *  2. retomada pelo mesmo id, com `ia_batches.job_id` (mig 225) como 2ª fonte;
 *  3. chave por item — `params.blueprintsFeitos` guarda os IDS já persistidos
 *     (ids, não nomes: `result_ids` guarda nome, que não é chave);
 *  4. early-return de `done`.
 *
 * ✅ `retry` CONCEDIDO em 24/08, com os quatro pré-requisitos acima de pé. Ele é
 * declarado AQUI, na task — nunca por `retries.default` no `trigger.config.ts`,
 * que alcançaria as 9 tasks sem retry, incluindo render/HeyGen (medido: o
 * executor faz `this.task.retry ?? retriesConfig?.default`, então o default é
 * global de verdade).
 *
 * ⚠️ Aqui uma retentativa que reaproveite o lote NÃO é grátis como nas outras:
 * quem não voltar no batch cai no síncrono. Por isso a 2ª fonte do `batchId`
 * importa mais nesta task do que em qualquer outra.
 */
const MAX_TENTATIVAS = 3;

export const gerarBlueprintBatchTask = task({
  id: 'gerar-blueprint-batch',
  maxDuration: 3600, // até 1h (batch async + persistência por colab)
  // Backoff longo de propósito: a falha típica aqui é FORNECEDOR (Anthropic,
  // Supabase), não corrida — retentar em 1s (o default do SDK) só gastaria as
  // três tentativas dentro da mesma indisponibilidade.
  retry: { maxAttempts: MAX_TENTATIVAS, minTimeoutInMs: 30_000, maxTimeoutInMs: 300_000, factor: 4 },
  run: async (payload: { jobId: string }, { ctx }) => {
    const sb = createSupabaseAdmin();
    // `patch` = progresso (best-effort) · `patchCritico` = checkpoint (falha alto).
    // O `{ error }` do supabase-js NÃO lança — ver lib/ia-jobs.ts.
    const { patch, patchCritico } = criarPatchJob(sb, payload.jobId);

    const { data: job, error: errJob } = await sb.from('ia_jobs').select('*').eq('id', payload.jobId).maybeSingle();
    if (errJob) throw new Error(`não foi possível ler o ia_job ${payload.jobId}: ${errJob.message}`);
    if (!job) throw new Error('ia_job não encontrado: ' + payload.jobId);

    // C3 — REENTRÂNCIA: job concluído não reexecuta. Aqui isso custaria o lote
    // inteiro MAIS o fallback síncrono de quem não voltasse no batch.
    if (job.status === 'done') {
      console.warn(`[gerar-blueprint-batch] job ${payload.jobId} já está done — nada a fazer (reentrância evitada)`);
      const jaFeitos = Array.isArray(job.result_ids) ? job.result_ids.length : 0;
      return { ok: true, jobId: payload.jobId, reentrante: true, okCount: jaFeitos, errCount: 0 };
    }

    await patch({ status: 'running' });

    try {
      const empresaId: string = job.empresa_id;
      const pp: any = job.params || {};
      const aiConfig = pp.aiConfig || {};
      const colabIds: string[] = Array.isArray(pp.colabIds) ? pp.colabIds : [];
      const total = colabIds.length;
      const model = String(aiConfig?.model || 'claude-sonnet-4-6');

      /**
       * C3 — chave por item. Guarda IDS, não nomes: `result_ids` carrega o nome
       * do colaborador (para a tela), e nome não é chave — dois "Ana Silva" na
       * mesma empresa fariam a retomada pular a pessoa errada.
       */
      const feitos = new Set<string>(Array.isArray(pp.blueprintsFeitos) ? pp.blueprintsFeitos : []);
      // `pp` é o params LIDO e nunca muda; gravar `{ ...pp, algo }` a cada
      // checkpoint apaga o anterior (foi assim que o batchIdGen sumia no IA3).
      const paramsAcum: Record<string, any> = { ...pp };
      const salvarParams = (novos: Record<string, any>) => {
        Object.assign(paramsAcum, novos);
        return patchCritico({ params: { ...paramsAcum } });
      };

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

      // 2) Batch DESTACADO. Falha total → mapa vazio → cada colab cai no síncrono.
      let respostas = new Map<string, string>();
      const aGerar = reqs.filter((r) => !feitos.has(r.customId));
      if (aGerar.length) {
        // 2ª fonte da retomada: o rastro em `ia_batches` por (job, feature).
        let batchIdAtivo: string | null = pp.batchId ?? (await batchPendenteDoJob(payload.jobId, 'blueprint_gerar'));
        try {
          if (!batchIdAtivo) {
            // C7: a mesma etiqueta do caminho síncrono (`taskKey: 'blueprint_gerar'`
            // abaixo). Sem ela o lote — que é o caminho PADRÃO — caía como
            // `feature: 'batch'` no ledger.
            batchIdAtivo = await createClaudeBatch(aGerar, {
              ledger: { feature: 'blueprint_gerar', empresaId, jobId: payload.jobId },
            });
            // Erro de PERSISTÊNCIA não é erro de FORNECEDOR: o lote está pago e
            // vai entregar. Descartá-lo aqui seria pagar o síncrono por cima.
            try {
              await salvarParams({ batchId: batchIdAtivo });
            } catch (ePersist: any) {
              console.error(`[gerar-blueprint-batch] batchId ${batchIdAtivo} NÃO persistido (${ePersist?.message}) — segue em memória; rastro em ia_batches`);
            }
          }
          for (let i = 0; i < 24 * 60; i++) {
            const st = await pollClaudeBatch(batchIdAtivo);
            if (st.ended) break;
            await pushProgress(`batch: ${st.counts.succeeded}/${aGerar.length} prontos…`);
            await wait.for({ seconds: 60 });
          }
          respostas = await fetchClaudeBatchResults(batchIdAtivo, { feature: 'blueprint_gerar', empresaId });
          await encerrarBatch(batchIdAtivo, IA_BATCH.CONCLUIDO);
        } catch (e: any) {
          console.warn(`[gerar-blueprint-batch] batch falhou (${e?.message}) — fallback síncrono por colab`);
          try { if (batchIdAtivo) await encerrarBatch(batchIdAtivo, IA_BATCH.ERRO, e?.message); } catch { /* observabilidade */ }
        }
      }

      // 3) Persiste colab a colab: resposta do batch OU fallback síncrono.
      const { callAI } = await import('@/actions/ai-client');
      for (const id of colabIds) {
        done++;
        if (buildErr.has(id)) { await pushProgress(`${nome(id)}: mapeamento incompleto`); continue; }
        if (feitos.has(id)) {
          resultados.push({ colab: nome(id), ok: true });
          await pushProgress(`${nome(id)}: de execução anterior`);
          continue;
        }
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
        if (r.ok) {
          feitos.add(id);
          await salvarParams({ blueprintsFeitos: [...feitos] }); // checkpoint incremental
        }
        await pushProgress(`${nome(id)}: ${r.ok ? 'ok' : 'erro'}`);
      }

      const okCount = resultados.filter((r) => r.ok).length;
      const errCount = resultados.length - okCount;
      await patchCritico({
        status: 'done', error: null,
        result_ids: resultados.filter((r) => r.ok).map((r) => r.colab),
        progress: { done: total, total, current: `concluído: ${okCount} ok, ${errCount} erro(s)`, resultados },
      });
      return { ok: true, jobId: payload.jobId, okCount, errCount };
    } catch (e: any) {
      // `error` só na ÚLTIMA tentativa: antes disso o job segue `running`, senão
      // o guard anti-duplicata solta e a tela anuncia falha de um lote que ainda
      // vai retentar (e aqui "disparar de novo" custa lote + síncrono).
      await registrarFalhaDaTentativa(patch, e, ctx, MAX_TENTATIVAS);
      throw e;
    }
  },
});
