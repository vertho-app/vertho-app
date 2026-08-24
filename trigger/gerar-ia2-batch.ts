import { task, wait } from '@trigger.dev/sdk';
import { criarPatchJob, registrarFalhaDaTentativa } from '@/lib/ia-jobs';
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { carregarContextoIA2, montarPromptIA2, persistirGabaritoIA2 } from '@/lib/ia2-gabarito';
import { createClaudeBatch, pollClaudeBatch, fetchClaudeBatchResults, encerrarBatch, batchPendenteDoJob, type BatchReq } from '@/lib/ai-batch';
import { IA_BATCH } from '@/lib/status';

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
 *
 * ── C3 (auditoria 22/08), 24/08: os pré-requisitos ANTES do retry ──────────
 *
 * Esta task submete lote PAGO. Ligar `retry` sem idempotência é recriar o C2 com
 * dinheiro: a run morre depois de submeter, a retentativa submete outro lote, e
 * o fallback síncrono ainda recompra pelo caminho caro. Os quatro pontos que
 * mudaram, todos copiados do `gerar-modulos-manuscrito`:
 *
 *  1. **batchId PERSISTIDO antes do polling** — era `submitClaudeBatch`, que
 *     cria e espera dentro da run, deixando o id só em memória. Morrer no meio
 *     queimava o lote sem deixar como retomá-lo.
 *  2. **Retomada pelo mesmo id** — `params.batchId` existente não recria nada.
 *  3. **Chave por item** — `result_ids` acumula os cargos JÁ persistidos e a
 *     retomada os pula. O checkpoint é incremental: `result_ids` que só existe
 *     no desfecho não retoma coisa nenhuma.
 *  4. **Early-return de `done`** — job concluído não reexecuta.
 *
 * ⚠️ E a distinção que o passo 1 do C3 ensinou medindo: **erro de PERSISTÊNCIA
 * não é erro de FORNECEDOR**. Falhar ao gravar o batchId não pode desviar para o
 * síncrono — o lote está pago e vai entregar; pagar o caminho caro por cima dele
 * é cobrar duas vezes pela mesma coisa.
 *
 * ✅ `retry` CONCEDIDO em 24/08, com os pré-requisitos de pé. Declarado AQUI, na
 * task — nunca por `retries.default` no `trigger.config.ts`, que alcançaria as 9
 * tasks sem retry, render/HeyGen inclusive (`this.task.retry ?? retriesConfig?.default`).
 */
const MAX_TENTATIVAS = 3;

export const gerarIA2BatchTask = task({
  id: 'gerar-ia2-batch',
  maxDuration: 3600, // até 1h (batch async + persistência por cargo)
  // Backoff longo: a falha típica é FORNECEDOR, não corrida — retentar em 1s (o
  // default do SDK) gastaria as 3 tentativas na mesma indisponibilidade.
  retry: { maxAttempts: MAX_TENTATIVAS, minTimeoutInMs: 30_000, maxTimeoutInMs: 300_000, factor: 4 },
  run: async (payload: { jobId: string }, { ctx }) => {
    const sb = createSupabaseAdmin();
    // `patch` = progresso (best-effort) · `patchCritico` = checkpoint (falha alto).
    // O `{ error }` do supabase-js NÃO lança — ver lib/ia-jobs.ts.
    const { patch, patchCritico } = criarPatchJob(sb, payload.jobId);

    const { data: job, error: errJob } = await sb.from('ia_jobs').select('*').eq('id', payload.jobId).maybeSingle();
    // Falha de LEITURA não é "job não existe" — com retry ligado, tratar as duas
    // como a mesma coisa faz a task desistir de um job que está lá.
    if (errJob) throw new Error(`não foi possível ler o ia_job ${payload.jobId}: ${errJob.message}`);
    if (!job) throw new Error('ia_job não encontrado: ' + payload.jobId);

    // C3 — REENTRÂNCIA: job concluído não reexecuta. Sem isto, uma segunda
    // execução refaz o lote inteiro pagando a IA de novo.
    if (job.status === 'done') {
      console.warn(`[gerar-ia2-batch] job ${payload.jobId} já está done — nada a fazer (reentrância evitada)`);
      const jaFeitos = Array.isArray(job.result_ids) ? job.result_ids.length : 0;
      return { ok: true, jobId: payload.jobId, reentrante: true, okCount: jaFeitos, errCount: 0 };
    }

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

      /**
       * C3 — CHAVE IDEMPOTENTE POR ITEM.
       *
       * `result_ids` guarda os cargos JÁ persistidos. Numa retomada, eles são
       * pulados: sem isso, o retry regrava gabarito que já estava certo e, pior,
       * paga a IA de novo por ele quando o batch não cobre o item.
       *
       * O checkpoint é incremental — cada persistência bem-sucedida grava a
       * lista acumulada, e não só no fim. Um `result_ids` que só existe no
       * desfecho não serve de retomada para nada.
       */
      const persistidos = new Set<string>(Array.isArray(job.result_ids) ? job.result_ids : []);
      const pendentes = items.filter((it) => !persistidos.has(it.cargoNome));
      const jaFeitos = items.length - pendentes.length;

      const resultados: Array<{ cargo: string; ok: boolean; error?: string; message?: string }> = [];
      let done = jaFeitos;
      const pushProgress = (current: string) =>
        patchCritico({ progress: { done, total, current, resultados }, result_ids: [...persistidos] });

      if (!pendentes.length) {
        await patchCritico({
          status: 'done', error: null, result_ids: [...persistidos],
          progress: { done: total, total, current: `nada a fazer (${jaFeitos} cargo(s) já persistidos)`, resultados: [] },
        });
        return { ok: true, jobId: payload.jobId, okCount: jaFeitos, errCount: 0, retomado: true };
      }

      await patch({
        progress: {
          done: jaFeitos, total,
          current: `lote (batch) — ${pendentes.length} cargo(s)${jaFeitos ? ` · ${jaFeitos} já feito(s)` : ''}…`,
          resultados: [],
        },
      });

      /**
       * 1) Batch DESTACADO — o padrão do `gerar-modulos-manuscrito`.
       *
       * Antes: `submitClaudeBatch` criava E esperava dentro da run, então o id
       * do lote só existia em memória. Morrer no meio queimava o lote pago sem
       * deixar como retomá-lo. Agora o id é PERSISTIDO antes do polling, e a
       * espera é `wait.for` (checkpointada: não consome maxDuration).
       */
      let respostas = new Map<string, string>();
      // A janela deixou de custar um lote: `ia_batches.job_id` (mig 225) é a
      // segunda fonte quando `params.batchId` não chegou a ser gravado.
      let batchIdAtivo: string | null = pp.batchId ?? (await batchPendenteDoJob(payload.jobId, 'ia2_gabarito'));
      try {
        if (!batchIdAtivo) {
          const reqs: BatchReq[] = pendentes.map((it) => {
            const { system, user } = montarPromptIA2({
              cargoNome: it.cargoNome, compNomes: it.compNomes, detalhe: it.detalhe,
              contextoPPP: ctx.contextoPPP, valores: ctx.valores, empresa: ctx.empresa,
            });
            return { customId: it.customId, system, user, model, maxTokens: 8192 };
          });
          batchIdAtivo = await createClaudeBatch(reqs, { ledger: { feature: 'ia2_gabarito', empresaId, jobId: payload.jobId } });

          /**
           * 🔑 Erro de PERSISTÊNCIA não é erro de FORNECEDOR — a lição medida no
           * passo 1 do C3 (`gerar-modulos-manuscrito`).
           *
           * Se a gravação do id falhar, o lote JÁ ESTÁ PAGO e vivo. Deixar o erro
           * cair no catch de baixo o trataria como "batch indisponível" e
           * desviaria para o síncrono — pagando o caminho caro por cima de um
           * lote que vai entregar. Aqui a falha é gritada e a run SEGUE com o id
           * em memória; o rastro em `ia_batches` (gravado por `createClaudeBatch`)
           * é o que torna o lote recuperável se esta run morrer.
           */
          try {
            await patchCritico({ params: { ...pp, batchId: batchIdAtivo } });
          } catch (ePersist: any) {
            console.error(
              `[gerar-ia2-batch] batchId ${batchIdAtivo} NÃO persistido (${ePersist?.message}) — ` +
              'seguindo com ele em memória; se a run morrer, o lote fica órfão RASTREÁVEL em ia_batches',
            );
          }
        }

        const MAX_ESPERAS = 24 * 60; // 24h em passos de 60s (limite do próprio batch)
        for (let i = 0; i < MAX_ESPERAS; i++) {
          const st = await pollClaudeBatch(batchIdAtivo);
          if (st.ended) break;
          await pushProgress(`batch: ${st.counts.succeeded}/${pendentes.length} prontos, ${st.counts.processing} na fila…`);
          await wait.for({ seconds: 60 });
        }
        respostas = await fetchClaudeBatchResults(batchIdAtivo, { feature: 'ia2_gabarito', empresaId });
        await encerrarBatch(batchIdAtivo, IA_BATCH.CONCLUIDO);
      } catch (e: any) {
        console.warn(`[gerar-ia2-batch] batch falhou (${e?.message}) — fallback síncrono por cargo`);
        try {
          if (batchIdAtivo) await encerrarBatch(batchIdAtivo, IA_BATCH.ERRO, e?.message);
        } catch { /* observabilidade nunca bloqueia o fallback */ }
      }

      // 2) Processa cargo a cargo: resposta do batch OU fallback síncrono; persiste.
      const { callAI } = await import('@/actions/ai-client');
      const { extractJSON } = await import('@/actions/utils');
      for (const it of pendentes) {
        let texto = respostas.get(it.customId);
        if (!texto || !texto.trim()) {
          // Sem resposta no batch (falha total OU request específico) → síncrono.
          try {
            const { system, user } = montarPromptIA2({
              cargoNome: it.cargoNome, compNomes: it.compNomes, detalhe: it.detalhe,
              contextoPPP: ctx.contextoPPP, valores: ctx.valores, empresa: ctx.empresa,
            });
            texto = await callAI(system, user, aiConfig, 8192, {
              taskKey: 'ia2_gabarito', source: 'batch-sync',
            });
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
        // Checkpoint: só entra em `persistidos` o que REALMENTE gravou. Marcar
        // antes de saber o desfecho faria a retomada pular um cargo que ficou
        // sem gabarito — silenciosamente, que é o pior jeito de ficar sem.
        if (r.ok) persistidos.add(it.cargoNome);
        done++;
        await pushProgress(`cargo ${it.cargoNome}: ${r.ok ? 'ok' : 'erro'}`);
      }

      const okCount = resultados.filter((r) => r.ok).length;
      const errCount = resultados.length - okCount;
      await patchCritico({
        status: 'done',
        error: null,
        result_ids: [...persistidos],
        progress: {
          done: total, total,
          current: `concluído: ${okCount} ok, ${errCount} erro(s)${jaFeitos ? ` · ${jaFeitos} de execução anterior` : ''}`,
          resultados,
        },
      });
      return { ok: true, jobId: payload.jobId, okCount: okCount + jaFeitos, errCount };
    } catch (e: any) {
      // `error` só na ÚLTIMA tentativa: antes disso o job segue `running`, senão
      // o guard anti-duplicata solta e a tela anuncia falha de um lote que ainda
      // vai retentar.
      await registrarFalhaDaTentativa(patch, e, ctx, MAX_TENTATIVAS);
      throw e;
    }
  },
});
