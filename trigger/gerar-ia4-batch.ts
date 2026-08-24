import { task, wait } from '@trigger.dev/sdk';
import { criarPatchJob, registrarFalhaDaTentativa } from '@/lib/ia-jobs';
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import {
  IA4_SYSTEM, IA4_COLAB_COLS,
  carregarContextoLoteIA4, carregarContextoRespostaIA4, buildIA4UserPrompt,
  validarAvaliacaoIA4, consolidarEPersistirIA4, avaliarUmaRespostaCore, IA4_MAX_TOKENS,
} from '@/lib/ia4-avaliacao';
import {
  montarCheckIA4Prompt, processCheckResult, persistirCheckIA4, checarUmaRespostaCore,
} from '@/lib/check-ia4-core';
import {
  createClaudeBatch, pollClaudeBatch, fetchClaudeBatchResults,
  createOpenAIBatch, pollOpenAIBatch, fetchOpenAIBatchResults,
  encerrarBatch, batchPendenteDoJob, type BatchReq,
} from '@/lib/ai-batch';
import { IA_BATCH } from '@/lib/status';

/**
 * IA4 (avaliação das respostas + check da 2ª IA) em LOTE, em BACKGROUND — molde
 * do `gerar-ia3-batch`. A tela enfileira (`enqueueIA4Batch` cria o `ia_jobs` e
 * dispara esta task) e acompanha por `ia_jobs.progress`.
 *
 * Por que a IA4 precisava disso mais que as outras fases (medido em 11/08/2026,
 * 72 respostas de Macaé): a avaliação leva ~100 s por resposta e rodava como uma
 * Server Action por item; como o Next despacha Server Action **uma por vez por
 * cliente**, a aba do admin ficava presa o lote inteiro (~2 h). Aqui o trabalho
 * sai da request: pode fechar a aba, e o Batch API corta 50% do custo.
 *
 * Duas ondas:
 *   1. AVALIAÇÃO (Claude, −50%): 1 request por resposta → valida → consolida em
 *      CÓDIGO e persiste. Sem resposta/JSON inválido → fallback SÍNCRONO no core.
 *   2. CHECK (OpenAI −50% p/ gpt-*; Claude −50% p/ claude-*): 1 request por
 *      avaliação persistida → nota/status derivados em código.
 *
 * Resiliência (mesmo contrato do IA2/IA3): falha POR-ITEM registra e segue;
 * falha do BATCH inteiro cai no fallback síncrono item a item.
 *
 * ✅ `retry` CONCEDIDO em 24/08, POR TASK — nunca por `retries.default` no
 * `trigger.config.ts`, que alcançaria as 9 tasks sem retry (o executor faz
 * `this.task.retry ?? retriesConfig?.default`).
 *
 * ⚠️ As DUAS ondas (avaliação e check) vivem sob o mesmo `jobId`, então a
 * recuperação do lote filtra por `feature` — sem isso, uma retomada colheria as
 * respostas do check achando que são da avaliação.
 */
const MAX_TENTATIVAS = 3;

export const gerarIA4BatchTask = task({
  id: 'gerar-ia4-batch',
  maxDuration: 3600,
  // Backoff longo: a falha típica é FORNECEDOR, não corrida.
  retry: { maxAttempts: MAX_TENTATIVAS, minTimeoutInMs: 30_000, maxTimeoutInMs: 300_000, factor: 4 },
  run: async (payload: { jobId: string }, { ctx }) => {
    const sb = createSupabaseAdmin();
    // `patch` = progresso (best-effort) · `patchCritico` = checkpoint (falha alto).
    // O `{ error }` do supabase-js NÃO lança — ver lib/ia-jobs.ts.
    const { patch, patchCritico } = criarPatchJob(sb, payload.jobId);

    const { data: job, error: errJob } = await sb.from('ia_jobs').select('*').eq('id', payload.jobId).maybeSingle();
    if (errJob) throw new Error(`não foi possível ler o ia_job ${payload.jobId}: ${errJob.message}`);
    if (!job) throw new Error('ia_job não encontrado: ' + payload.jobId);

    // C3 — REENTRÂNCIA: job concluído não reexecuta (aqui custaria DOIS lotes).
    if (job.status === 'done') {
      console.warn(`[gerar-ia4-batch] job ${payload.jobId} já está done — nada a fazer (reentrância evitada)`);
      const jaFeitos = Array.isArray(job.result_ids) ? job.result_ids.length : 0;
      return { ok: true, jobId: payload.jobId, reentrante: true, okCount: jaFeitos, errCount: 0 };
    }
    await patch({ status: 'running' });

    try {
      const empresaId: string = job.empresa_id;
      const pp: any = job.params || {};
      const aiConfig = pp.aiConfig || {};
      const ids: string[] = Array.isArray(pp.items) ? pp.items.map((i: any) => i.id ?? i) : [];
      // Avaliações que já existem e nunca passaram pela 2ª IA — entram só na onda 2.
      const checkOnlyIds: string[] = Array.isArray(pp.checkOnlyIds) ? pp.checkOnlyIds : [];
      const genModel = String(aiConfig?.model || 'claude-sonnet-4-6');
      const checkModel: string | null = aiConfig?.checkModel || null;

      const tdb = tenantDb(empresaId);
      const total = ids.length * (checkModel ? 2 : 1) + (checkModel ? checkOnlyIds.length : 0);
      const resultados: Array<{ cargo: string; ok: boolean; error?: string; message?: string }> = [];
      let done = 0;
      /**
       * C3 — chaves de retomada, uma por onda. `avaliados` guarda os ids de
       * resposta já persistidos; `checados`, os já auditados pela 2ª IA. As duas
       * são independentes: a run pode morrer entre elas.
       */
      const avaliados = new Set<string>(Array.isArray(pp.avaliados) ? pp.avaliados : []);
      const checados = new Set<string>(Array.isArray(pp.checados) ? pp.checados : []);

      /**
       * 🔴 `pp` é o params LIDO no início e nunca muda. Gravar `{ ...pp, algo }`
       * a cada checkpoint apaga o que os anteriores gravaram — era assim que o
       * `batchIdGen` sumia no primeiro salvamento e a retomada recriava o lote.
       * O acumulador é a fonte.
       */
      const paramsAcum: Record<string, any> = { ...pp };
      const salvarParams = (novos: Record<string, any>) => {
        Object.assign(paramsAcum, novos);
        return patchCritico({ params: { ...paramsAcum } });
      };
      const salvarCheckpoint = () => salvarParams({ avaliados: [...avaliados], checados: [...checados] });

      const pushProgress = (current: string) => patch({ progress: { done, total, current, resultados } });
      await patch({ progress: { done: 0, total, current: `lote (batch) — ${ids.length} resposta(s)…`, resultados: [] } });

      const { data: respostas } = await tdb.from('respostas').select('*').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      if (!respostas?.length && !checkOnlyIds.length) {
        await patch({ status: 'done', progress: { done: total, total, current: 'nada a avaliar', resultados: [] } });
        return { ok: true, jobId: payload.jobId, okCount: 0, errCount: 0 };
      }

      const colabIds = [...new Set((respostas || []).map((r: any) => r.colaborador_id).filter(Boolean))];
      const { data: colabs } = await tdb.from('colaboradores').select(IA4_COLAB_COLS).in('id', colabIds);
      const colabMap: Record<string, any> = {};
      (colabs || []).forEach((c: any) => { colabMap[c.id] = c; });

      // Empresa + PPP: iguais para o lote inteiro, lidos 1×.
      const { empresa, contextoPPP } = await carregarContextoLoteIA4(tdb, sb, empresaId);

      // ── Onda 1: AVALIAÇÃO ──────────────────────────────────────────────
      const preparados: Array<{ customId: string; resp: any; colab: any; ctx: any; user: string; rotulo: string }> = [];
      for (const [i, resp] of (respostas || []).entries()) {
        const colab = colabMap[resp.colaborador_id] || {};
        const ctx = await carregarContextoRespostaIA4(tdb, sb, resp);
        const { cachedUserPrefix, user } = buildIA4UserPrompt(resp, colab, empresa, contextoPPP, ctx);
        // No Batch API não há 2º breakpoint de cache (`cachedUserPrefix` só existe
        // no callAI síncrono), então o prefixo estável entra concatenado. O system
        // > 4000 chars segue cacheado pelo próprio createClaudeBatch.
        preparados.push({
          customId: `i${i}`, resp, colab, ctx,
          user: `${cachedUserPrefix}\n\n${user}`,
          rotulo: `${colab?.nome_completo || resp.colaborador_id?.slice(0, 8)} — ${ctx.compNome || resp.competencia_nome || 'competência'}`,
        });
      }

      let respostasGen = new Map<string, string>();
      const aAvaliar = preparados.filter((p) => !avaliados.has(p.resp.id));
      if (aAvaliar.length && genModel.startsWith('claude')) {
        // `ia_batches.job_id` (mig 225) é a 2ª fonte quando o id não foi gravado.
        let batchIdGen: string | null = pp.batchIdGen ?? (await batchPendenteDoJob(payload.jobId, 'ia4_avaliacao'));
        try {
          if (!batchIdGen) {
            const reqs: BatchReq[] = aAvaliar.map((p) => ({ customId: p.customId, system: IA4_SYSTEM, user: p.user, model: genModel, maxTokens: IA4_MAX_TOKENS }));
            batchIdGen = await createClaudeBatch(reqs, { ledger: { feature: 'ia4_avaliacao', empresaId, jobId: payload.jobId } });
            // Persistência ≠ fornecedor: o lote está pago e vai entregar.
            try {
              await salvarParams({ batchIdGen });
            } catch (ePersist: any) {
              console.error(`[gerar-ia4-batch] batchIdGen ${batchIdGen} NÃO persistido (${ePersist?.message}) — segue em memória; rastro em ia_batches`);
            }
          }
          for (let i = 0; i < 24 * 60; i++) {
            const st = await pollClaudeBatch(batchIdGen);
            if (st.ended) break;
            await pushProgress(`avaliação: ${st.counts.succeeded}/${aAvaliar.length} prontas…`);
            await wait.for({ seconds: 60 });
          }
          respostasGen = await fetchClaudeBatchResults(batchIdGen, { feature: 'ia4_avaliacao', empresaId });
          await encerrarBatch(batchIdGen, IA_BATCH.CONCLUIDO);
        } catch (e: any) {
          console.warn(`[gerar-ia4-batch] batch avaliação falhou (${e?.message}) — fallback síncrono por item`);
          try { if (batchIdGen) await encerrarBatch(batchIdGen, IA_BATCH.ERRO, e?.message); } catch { /* observabilidade */ }
        }
      }

      const { extractJSON } = await import('@/actions/utils');
      const avaliadas: Array<{ resp: any; rotulo: string }> = [];

      for (const p of preparados) {
        if (avaliados.has(p.resp.id)) {
          avaliadas.push({ resp: p.resp, rotulo: p.rotulo });
          resultados.push({ cargo: p.rotulo, ok: true, message: 'avaliação de execução anterior' });
          done++; await pushProgress(`retomada ${p.rotulo}`);
          continue;
        }
        const texto = respostasGen.get(p.customId);
        let r: { success: boolean; message?: string; error?: string };
        if (texto && texto.trim()) {
          const avaliacao = await extractJSON(texto);
          const valido = validarAvaliacaoIA4(avaliacao, p.rotulo);
          r = valido.ok
            ? await consolidarEPersistirIA4(tdb, p.resp, p.colab, avaliacao, p.ctx)
            // Batch respondeu mas o JSON não serve → core síncrono (tem retry próprio).
            : await avaliarUmaRespostaCore(tdb, sb, p.resp, p.colab, empresa, contextoPPP, aiConfig);
        } else {
          // Sem linha no batch (falha total, modelo não-Claude, request perdido).
          r = await avaliarUmaRespostaCore(tdb, sb, p.resp, p.colab, empresa, contextoPPP, aiConfig);
        }
        resultados.push({ cargo: p.rotulo, ok: !!r.success, error: r.error, message: r.message });
        if (r.success) {
          avaliadas.push({ resp: p.resp, rotulo: p.rotulo });
          avaliados.add(p.resp.id);
          await salvarCheckpoint(); // incremental: só serve de retomada se gravar durante
        }
        done++; await pushProgress(`avaliado ${p.rotulo}`);
      }

      // ── Onda 2: CHECK (2ª IA) ──────────────────────────────────────────
      const alvosCheck = [
        ...avaliadas.map((a) => ({ id: a.resp.id, rotulo: a.rotulo })),
        ...checkOnlyIds.map((id) => ({ id, rotulo: `(avaliada antes) ${String(id).slice(0, 8)}` })),
      ];
      if (checkModel && alvosCheck.length) {
        // Relê as respostas: o check audita a avaliação PERSISTIDA, não a que
        // está na memória desta run.
        const checks: Array<{ customId: string; resp: any; rotulo: string; system: string; user: string }> = [];
        for (const [i, a] of alvosCheck.entries()) {
          const { data: resp } = await tdb.from('respostas')
            .select('id, empresa_id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, avaliacao_ia, nivel_ia4')
            .eq('id', a.id).maybeSingle();
          if (!resp?.avaliacao_ia) continue;
          const { system, prefix, user } = await montarCheckIA4Prompt(sb, resp, empresaId);
          checks.push({ customId: `k${i}`, resp, rotulo: a.rotulo, system, user: `${prefix}\n\n${user}` });
        }

        let respostasChk = new Map<string, string>();
        const ledgerChk = { feature: 'ia4_check', empresaId, jobId: payload.jobId };
        let batchIdChk: string | null = pp.batchIdChk ?? null;
        try {
          // Só os NÃO checados entram no lote — é aí que está o custo de IA.
          const reqs: BatchReq[] = checks
            .filter((c) => !checados.has(c.resp.id))
            .map((c) => ({ customId: c.customId, system: c.system, user: c.user, model: checkModel, maxTokens: 8192 }));
          const ehOpenAI = checkModel.startsWith('gpt');
          const ehClaude = checkModel.startsWith('claude');

          if (reqs.length && (ehOpenAI || ehClaude)) {
            if (!batchIdChk) {
              batchIdChk = ehOpenAI
                ? await createOpenAIBatch(reqs, { ledger: ledgerChk })
                : await createClaudeBatch(reqs, { ledger: ledgerChk });
              try {
                await salvarParams({ batchIdChk });
              } catch (ePersist: any) {
                console.error(`[gerar-ia4-batch] batchIdChk ${batchIdChk} NÃO persistido (${ePersist?.message}) — segue em memória; rastro em ia_batches`);
              }
            }

            if (ehOpenAI) {
              let saida: string | null = null;
              for (let i = 0; i < 24 * 60; i++) {
                const st = await pollOpenAIBatch(batchIdChk);
                if (st.ended) {
                  if (st.status !== 'completed') throw new Error(`OpenAI batch ${batchIdChk} terminou como ${st.status}`);
                  saida = st.outputFileId;
                  break;
                }
                await pushProgress(`check: aguardando OpenAI (${reqs.length} item(s))…`);
                await wait.for({ seconds: 60 });
              }
              if (!saida) throw new Error(`OpenAI batch ${batchIdChk} sem output_file_id`);
              respostasChk = await fetchOpenAIBatchResults(saida, ledgerChk);
            } else {
              for (let i = 0; i < 24 * 60; i++) {
                const st = await pollClaudeBatch(batchIdChk);
                if (st.ended) break;
                await pushProgress(`check: ${st.counts.succeeded}/${reqs.length} prontos…`);
                await wait.for({ seconds: 60 });
              }
              respostasChk = await fetchClaudeBatchResults(batchIdChk, ledgerChk);
            }
            await encerrarBatch(batchIdChk, IA_BATCH.CONCLUIDO);
          }
          // Outros provedores (gemini/kimi): sem Batch API aqui → mapa vazio = síncrono.
        } catch (e: any) {
          console.warn(`[gerar-ia4-batch] batch check falhou (${e?.message}) — fallback síncrono por item`);
          try { if (batchIdChk) await encerrarBatch(batchIdChk, IA_BATCH.ERRO, e?.message); } catch { /* observabilidade */ }
        }

        for (const c of checks) {
          if (checados.has(c.resp.id)) {
            resultados.push({ cargo: c.rotulo, ok: true, message: 'check de execução anterior' });
            done++; await pushProgress(`check retomado ${c.rotulo}`);
            continue;
          }
          const texto = respostasChk.get(c.customId);
          let registrado = false;
          if (texto && texto.trim()) {
            const raw = await extractJSON(texto);
            const { status, check } = processCheckResult(raw, c.resp.avaliacao_ia);
            if (check) {
              const { error } = await persistirCheckIA4(sb, c.resp.id, empresaId, status, check);
              resultados.push(error
                ? { cargo: c.rotulo, ok: false, error: `check: ${error}` }
                : { cargo: c.rotulo, ok: true, message: `check ${check.nota}pts (${status})` });
              registrado = true;
            }
          }
          if (!registrado) {
            const r: any = await checarUmaRespostaCore(sb, c.resp.id, { model: checkModel });
            resultados.push({ cargo: c.rotulo, ok: !!r.success, error: r.error, message: r.success ? `check ${r.nota}pts (síncrono)` : undefined });
          }
          // Checkpoint da 2ª onda: só o que REALMENTE persistiu entra, para a
          // retomada não pular um check que ficou faltando.
          if (resultados[resultados.length - 1]?.ok) {
            checados.add(c.resp.id);
            await salvarCheckpoint();
          }
          done++; await pushProgress(`check ${c.rotulo}`);
        }
        // Respostas que não chegaram a ser avaliadas não têm check — completa a barra.
        done += Math.max(0, alvosCheck.length - checks.length) + (ids.length - preparados.length);
      }

      const okCount = resultados.filter((r) => r.ok).length;
      const errCount = resultados.length - okCount;
      await patch({
        status: 'done',
        error: null,
        result_ids: avaliadas.map((a) => a.resp.id),
        progress: { done: total, total, current: `concluído: ${okCount} ok, ${errCount} erro(s)`, resultados },
      });
      return { ok: true, jobId: payload.jobId, okCount, errCount };
    } catch (e: any) {
      // `error` só na ÚLTIMA tentativa: antes disso o job segue `running`, senão
      // o guard anti-duplicata solta e a tela anuncia falha de um lote que ainda
      // vai retentar.
      await registrarFalhaDaTentativa(patch, e, ctx, MAX_TENTATIVAS);
      throw e;
    }
  },
});
