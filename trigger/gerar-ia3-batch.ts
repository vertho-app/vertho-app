import { task, wait } from '@trigger.dev/sdk';
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  montarContextoIA3, buildIA3SystemPrompt, buildIA3UserPrompt,
  validarRespostaIA3, montarAlternativasIA3, persistirCenarioIA3,
  montarCheckIA3Prompt, normalizarResultadoCheckIA3, persistirCheckIA3,
  gerarCenarioIA3Core, checkCenarioIA3Core,
} from '@/lib/ia3-cenarios';
import {
  createClaudeBatch, pollClaudeBatch, fetchClaudeBatchResults,
  createOpenAIBatch, pollOpenAIBatch, fetchOpenAIBatchResults,
  encerrarBatch, type BatchReq,
} from '@/lib/ai-batch';
import { IA_BATCH } from '@/lib/status';

/**
 * IA3 (cenários A + check dual) em LOTE, em BACKGROUND — molde do gerar-ia2-batch.
 * A tela enfileira (enqueueIA3Batch cria ia_jobs + dispara esta task) e faz
 * polling de ia_jobs.progress. Roda service-role; isolamento por tenantDb nos
 * blocos do núcleo (lib/ia3-cenarios).
 *
 * Duas ondas de batch:
 *   1. GERAÇÃO (Claude, −50%): 1 request por item da fila → valida → persiste.
 *      Item com validação com erros → retry SÍNCRONO (mesma mecânica do core).
 *   2. CHECK (OpenAI −50% p/ gpt-*; Claude −50% p/ claude-*; senão síncrono):
 *      1 request por cenário persistido → nota/status derivados EM CÓDIGO.
 *
 * Resiliência (mesmo contrato do IA2): falha POR-ITEM registra e segue; falha
 * do BATCH inteiro cai no fallback síncrono por item (nunca perde conteúdo).
 *
 * ── C3 (auditoria 22/08), 24/08: pré-requisitos ANTES do retry ─────────────
 *
 * Esta é a task com DUAS ondas de lote pago, e por isso a mais cara de repetir:
 * um retry cego re-submeteria a geração E o check. Os pré-requisitos foram
 * copiados do `gerar-modulos-manuscrito`, um para cada onda:
 *
 *  1. **dois batchIds persistidos** (`batchIdGen`, `batchIdChk`) ANTES do
 *     polling, com `wait.for` checkpointado no lugar da espera dentro da run;
 *  2. **retomada por onda** — cada id existente é reaproveitado;
 *  3. **chave por item**: `params.geradosPorItem` mapeia
 *     `cargo::competencia::ppp` → `cenarioId`, e `params.checados` guarda os
 *     cenários já checados. A retomada pula a geração do que existe e o check
 *     do que já foi checado — as duas ondas idempotentes, separadamente;
 *  4. **early-return de `done`**.
 *
 * ⚠️ Erro de PERSISTÊNCIA não é erro de FORNECEDOR: falhar ao gravar um batchId
 * não desvia para o síncrono — o lote está pago e vai entregar.
 *
 * 🚧 `retry` continua NÃO declarado. Ele vem quando as quatro tasks tiverem os
 * pré-requisitos, POR TASK, e nunca por default no `trigger.config.ts`.
 */
export const gerarIA3BatchTask = task({
  id: 'gerar-ia3-batch',
  maxDuration: 3600,
  run: async (payload: { jobId: string }) => {
    const sb = createSupabaseAdmin();
    const patch = (f: Record<string, unknown>) =>
      sb.from('ia_jobs').update({ ...f, updated_at: new Date().toISOString() }).eq('id', payload.jobId);

    const { data: job, error: errJob } = await sb.from('ia_jobs').select('*').eq('id', payload.jobId).maybeSingle();
    if (errJob) throw new Error(`não foi possível ler o ia_job ${payload.jobId}: ${errJob.message}`);
    if (!job) throw new Error('ia_job não encontrado: ' + payload.jobId);

    // C3 — REENTRÂNCIA: job concluído não reexecuta (aqui custaria DOIS lotes).
    if (job.status === 'done') {
      console.warn(`[gerar-ia3-batch] job ${payload.jobId} já está done — nada a fazer (reentrância evitada)`);
      const jaFeitos = Array.isArray(job.result_ids) ? job.result_ids.length : 0;
      return { ok: true, jobId: payload.jobId, reentrante: true, okCount: jaFeitos, errCount: 0 };
    }

    await patch({ status: 'running' });

    try {
      const empresaId: string = job.empresa_id;
      const pp: any = job.params || {};
      const aiConfig = pp.aiConfig || {};
      const items: Array<{ cargo: string; competencia_id: string; ppp_escola_id: string | null; nome: string }> =
        Array.isArray(pp.items) ? pp.items : [];
      const genModel = String(aiConfig?.model || 'claude-sonnet-4-6');
      const checkModel: string | null = aiConfig?.checkModel || null;

      /**
       * C3 — CHAVE IDEMPOTENTE POR ITEM, uma para cada onda.
       *
       * `geradosPorItem` sobrevive à run em `params`: a retomada não regera
       * cenário que já foi persistido (e não paga a IA por ele de novo).
       * `checados` faz o mesmo para a segunda onda — as duas são independentes,
       * porque uma run pode morrer entre elas.
       *
       * A chave é do ITEM (cargo + competência + PPP), não o `cenarioId`: o id
       * só existe DEPOIS de gerar, e é justamente antes disso que precisamos
       * saber se já foi feito.
       */
      const chaveItem = (it: { cargo: string; competencia_id: string; ppp_escola_id: string | null }) =>
        `${it.cargo}::${it.competencia_id}::${it.ppp_escola_id ?? ''}`;
      const geradosPorItem: Record<string, string> = { ...(pp.geradosPorItem || {}) };
      const checados = new Set<string>(Array.isArray(pp.checados) ? pp.checados : []);

      /**
       * 🔴 `pp` é o params LIDO no início e nunca mais muda. Gravar
       * `{ ...pp, algo }` a cada checkpoint sobrescreve o que os checkpoints
       * ANTERIORES gravaram — foi assim que o `batchIdGen` sumia no primeiro
       * salvamento de progresso, e a retomada voltava a criar lote.
       *
       * É a mesma classe da fresta do manuscrito (`patch()` grava no banco e não
       * reatribui a variável local). Aqui o acumulador é a fonte.
       */
      const paramsAcum: Record<string, any> = { ...pp };
      const salvarParams = (novos: Record<string, any>) => {
        Object.assign(paramsAcum, novos);
        return patch({ params: { ...paramsAcum } });
      };

      // total = geração + (check, se houver) — a barra reflete as duas ondas.
      const total = items.length * (checkModel ? 2 : 1);
      const resultados: Array<{ cargo: string; ok: boolean; error?: string; message?: string }> = [];
      let done = 0;
      const pushProgress = (current: string) => patch({ progress: { done, total, current, resultados } });
      await patch({ progress: { done: 0, total, current: `lote (batch) — ${items.length} cenário(s)…`, resultados: [] } });

      // ── Onda 1: GERAÇÃO ────────────────────────────────────────────────
      // Monta contexto+prompts por item (guardados p/ o retry síncrono).
      const preparados: Array<{ customId: string; item: (typeof items)[number]; ctx: any; system: string; user: string } | { customId: string; item: (typeof items)[number]; erro: string }> = [];
      for (const [i, item] of items.entries()) {
        const customId = `i${i}`;
        const mc = await montarContextoIA3(sb, empresaId, item.cargo, item.competencia_id, item.ppp_escola_id ?? null);
        if (!('ctx' in mc)) { preparados.push({ customId, item, erro: mc.error }); continue; }
        const system = buildIA3SystemPrompt();
        const user = buildIA3UserPrompt(mc.ctx.empresa, item.cargo, mc.ctx.cargoDetalhe, mc.ctx.comp, mc.ctx.descritores, mc.ctx.valores, mc.ctx.contextoPPP, mc.ctx.gabCIS);
        preparados.push({ customId, item, ctx: mc.ctx, system, user });
      }

      let respostasGen = new Map<string, string>();
      // Só entram no lote os itens que AINDA não têm cenário persistido.
      const batcaveis = preparados
        .filter((p): p is Extract<typeof preparados[number], { ctx: any }> => 'ctx' in p)
        .filter((p) => !geradosPorItem[chaveItem(p.item)]);
      if (batcaveis.length && genModel.startsWith('claude')) {
        let batchIdGen: string | null = pp.batchIdGen ?? null;
        try {
          if (!batchIdGen) {
            const reqs: BatchReq[] = batcaveis.map((p) => ({ customId: p.customId, system: p.system, user: p.user, model: genModel, maxTokens: 6144 }));
            batchIdGen = await createClaudeBatch(reqs, { ledger: { feature: 'ia3_cenarios', empresaId } });
            // Persistência ≠ fornecedor: o lote está pago; seguir com o id em
            // memória é melhor que descartá-lo pelo caminho caro.
            try {
              await salvarParams({ batchIdGen });
            } catch (ePersist: any) {
              console.error(`[gerar-ia3-batch] batchIdGen ${batchIdGen} NÃO persistido (${ePersist?.message}) — segue em memória; rastro em ia_batches`);
            }
          }
          for (let i = 0; i < 24 * 60; i++) {
            const st = await pollClaudeBatch(batchIdGen);
            if (st.ended) break;
            await pushProgress(`geração: ${st.counts.succeeded}/${batcaveis.length} prontos…`);
            await wait.for({ seconds: 60 });
          }
          respostasGen = await fetchClaudeBatchResults(batchIdGen, { feature: 'ia3_cenarios', empresaId });
          await encerrarBatch(batchIdGen, IA_BATCH.CONCLUIDO);
        } catch (e: any) {
          console.warn(`[gerar-ia3-batch] batch geração falhou (${e?.message}) — fallback síncrono por item`);
          try { if (batchIdGen) await encerrarBatch(batchIdGen, IA_BATCH.ERRO, e?.message); } catch { /* observabilidade */ }
        }
      }

      const { extractJSON } = await import('@/actions/utils');
      const { callAI } = await import('@/actions/ai-client');
      const gerados: Array<{ item: (typeof items)[number]; cenarioId: string | null }> = [];

      for (const p of preparados) {
        if (!('ctx' in p)) {
          resultados.push({ cargo: `${p.item.nome} (${p.item.cargo})`, ok: false, error: p.erro });
          done++; await pushProgress(`${p.item.nome}: contexto indisponível`);
          continue;
        }
        const rotulo = `${p.item.nome} (${p.item.cargo})`;

        // Retomada: cenário já persistido numa execução anterior não é regerado
        // — segue direto para a onda de check.
        const jaGerado = geradosPorItem[chaveItem(p.item)];
        if (jaGerado) {
          gerados.push({ item: p.item, cenarioId: jaGerado });
          resultados.push({ cargo: rotulo, ok: true, message: 'cenário de execução anterior' });
          done++; await pushProgress(`retomado ${rotulo}`);
          continue;
        }

        let cenarioId: string | null = null;
        const texto = respostasGen.get(p.customId);
        if (texto && texto.trim()) {
          // Resposta do batch: valida; erros críticos → retry SÍNCRONO (core).
          const resultado = await extractJSON(texto);
          const norm = resultado ? validarRespostaIA3(resultado, p.ctx.descritores.length) : null;
          if (norm && norm.errors.length === 0) {
            const alternativas = montarAlternativasIA3(resultado, norm.cen, norm.perguntas);
            const persist = await persistirCenarioIA3(p.ctx.tdb, {
              compId: p.ctx.comp.id, cargoNome: p.item.cargo, pppEscolaId: p.item.ppp_escola_id ?? null,
              titulo: norm.cen.titulo || norm.titulo, contexto: norm.cen.contexto || norm.contexto, alternativas,
            });
            if ('cenarioId' in persist) {
              cenarioId = persist.cenarioId;
              resultados.push({ cargo: rotulo, ok: true, message: 'cenário gerado (batch)' });
            } else {
              resultados.push({ cargo: rotulo, ok: false, error: persist.error });
            }
          } else {
            // Batch respondeu mas inválido/incompleto → core síncrono (com retry).
            const r = await gerarCenarioIA3Core(sb, { empresaId, cargoNome: p.item.cargo, competenciaId: p.item.competencia_id, pppEscolaId: p.item.ppp_escola_id ?? null, aiConfig });
            cenarioId = r.cenarioId ?? null;
            resultados.push({ cargo: rotulo, ok: !!r.success, error: r.error, message: r.success ? 'cenário gerado (retry síncrono)' : undefined });
          }
        } else {
          // Sem resposta no batch (falha total, modelo não-Claude, request perdido).
          const r = await gerarCenarioIA3Core(sb, { empresaId, cargoNome: p.item.cargo, competenciaId: p.item.competencia_id, pppEscolaId: p.item.ppp_escola_id ?? null, aiConfig });
          cenarioId = r.cenarioId ?? null;
          resultados.push({ cargo: rotulo, ok: !!r.success, error: r.error, message: r.success ? 'cenário gerado (síncrono)' : undefined });
        }
        if (cenarioId) {
          gerados.push({ item: p.item, cenarioId });
          // Checkpoint INCREMENTAL: grava a cada cenário, não só no fim. Um
          // mapa que só existe no desfecho não retoma nada.
          geradosPorItem[chaveItem(p.item)] = cenarioId;
          await salvarParams({ geradosPorItem, checados: [...checados] });
        }
        done++; await pushProgress(`gerado ${rotulo}`);
      }

      // ── Onda 2: CHECK dual ─────────────────────────────────────────────
      if (checkModel && gerados.length) {
        // Busca as rows recém-persistidas e monta os prompts do check.
        const checks: Array<{ customId: string; cen: any; rotulo: string; system: string; user: string }> = [];
        for (const [i, g] of gerados.entries()) {
          const { data: cen } = await sb.from('banco_cenarios').select('*').eq('id', g.cenarioId).maybeSingle();
          if (!cen) continue;
          const { system, user } = await montarCheckIA3Prompt(sb, cen);
          checks.push({ customId: `k${i}`, cen, rotulo: `${g.item.nome} (${g.item.cargo})`, system, user });
        }

        let respostasChk = new Map<string, string>();
        const ledgerChk = { feature: 'ia3_check', empresaId };
        let batchIdChk: string | null = pp.batchIdChk ?? null;
        try {
          // Só os NÃO checados entram no lote — o custo de IA está aqui, não na
          // montagem do prompt (que é só query).
          const reqs: BatchReq[] = checks
            .filter((c) => !checados.has(c.cen.id))
            .map((c) => ({ customId: c.customId, system: c.system, user: c.user, model: checkModel, maxTokens: 4096 }));
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
                console.error(`[gerar-ia3-batch] batchIdChk ${batchIdChk} NÃO persistido (${ePersist?.message}) — segue em memória; rastro em ia_batches`);
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
                await pushProgress(`check: aguardando OpenAI (${checks.length} item(s))…`);
                await wait.for({ seconds: 60 });
              }
              if (!saida) throw new Error(`OpenAI batch ${batchIdChk} sem output_file_id`);
              respostasChk = await fetchOpenAIBatchResults(saida, ledgerChk);
            } else {
              for (let i = 0; i < 24 * 60; i++) {
                const st = await pollClaudeBatch(batchIdChk);
                if (st.ended) break;
                await pushProgress(`check: ${st.counts.succeeded}/${checks.length} prontos…`);
                await wait.for({ seconds: 60 });
              }
              respostasChk = await fetchClaudeBatchResults(batchIdChk, ledgerChk);
            }
            await encerrarBatch(batchIdChk, IA_BATCH.CONCLUIDO);
          }
          // Outros provedores (gemini/kimi): sem Batch API aqui → mapa vazio = síncrono.
        } catch (e: any) {
          console.warn(`[gerar-ia3-batch] batch check falhou (${e?.message}) — fallback síncrono por item`);
          try { if (batchIdChk) await encerrarBatch(batchIdChk, IA_BATCH.ERRO, e?.message); } catch { /* observabilidade */ }
        }

        for (const c of checks) {
          if (checados.has(c.cen.id)) {
            resultados.push({ cargo: c.rotulo, ok: true, message: 'check de execução anterior' });
            done++; await pushProgress(`check retomado ${c.rotulo}`);
            continue;
          }
          const texto = respostasChk.get(c.customId);
          if (texto && texto.trim()) {
            const resultado = await extractJSON(texto);
            const normed = normalizarResultadoCheckIA3(resultado);
            if (normed) {
              const persist = await persistirCheckIA3(sb, c.cen, normed.resultado, normed.statusCheck);
              if ('error' in persist) resultados.push({ cargo: c.rotulo, ok: false, error: `check: ${persist.error}` });
              else resultados.push({ cargo: c.rotulo, ok: true, message: `check ${normed.resultado.nota}pts (${normed.statusCheck})` });
            } else {
              const r = await checkCenarioIA3Core(sb, { cenarioId: c.cen.id, modelo: checkModel });
              resultados.push({ cargo: c.rotulo, ok: !!r.success, error: r.error, message: r.success ? `check ${r.nota}pts (síncrono)` : undefined });
            }
          } else {
            const r = await checkCenarioIA3Core(sb, { cenarioId: c.cen.id, modelo: checkModel });
            resultados.push({ cargo: c.rotulo, ok: !!r.success, error: r.error, message: r.success ? `check ${r.nota}pts (síncrono)` : undefined });
          }
          if (resultados[resultados.length - 1]?.ok) {
            checados.add(c.cen.id);
            await salvarParams({ geradosPorItem, checados: [...checados] });
          }
          done++; await pushProgress(`check ${c.rotulo}`);
        }
        // Itens sem cenário persistido não têm check — completa a contagem.
        done += (items.length - gerados.length);
      }

      const okCount = resultados.filter((r) => r.ok).length;
      const errCount = resultados.length - okCount;
      await patch({
        status: 'done',
        error: null,
        result_ids: gerados.map((g) => g.cenarioId).filter(Boolean),
        progress: { done: total, total, current: `concluído: ${okCount} ok, ${errCount} erro(s)`, resultados },
      });
      return { ok: true, jobId: payload.jobId, okCount, errCount };
    } catch (e: any) {
      await patch({ status: 'error', error: String(e?.message || e).slice(0, 500) });
      throw e;
    }
  },
});
