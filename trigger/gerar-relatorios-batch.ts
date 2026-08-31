import { task, wait } from '@trigger.dev/sdk';
import { criarPatchJob, registrarFalhaDaTentativa } from '@/lib/ia-jobs';
import { createSupabaseAdmin } from '@/lib/supabase';
import { buildRelatorioIndividualReq, persistRelatorioIndividualFromText } from '@/lib/relatorios/individual-core';
import {
  createClaudeBatch, pollClaudeBatch, fetchClaudeBatchResults,
  encerrarBatch, batchPendenteDoJob, type BatchReq,
} from '@/lib/ai-batch';
import { IA_BATCH } from '@/lib/status';

/**
 * PDI (relatório individual) em LOTE, em BACKGROUND.
 *
 * 🔴 POR QUE ELE EXISTE (31/08/2026). O PDI era o único da família sem lote: a
 * tela montava a fila e iterava chamando `gerarRelatorioIndividual` uma vez por
 * pessoa, com a aba presa o tempo todo. Medido em 78 gerações reais: **59s de
 * média, p90 de 70s, máximo 86s** — 43 professores de Macaé dariam ~45 min de
 * aba aberta, e Server Action é despachada UMA POR VEZ por cliente, então não
 * há paralelismo a ganhar do lado do browser.
 *
 * O desconto de 50% da Batch API é o menor dos ganhos aqui (US$ 1,40 em 43
 * PDIs). O que o lote resolve é a aba.
 *
 * Espelha `gerar-blueprint-batch` nos quatro pré-requisitos do C3: batch
 * DESTACADO com `batchId` persistido antes do polling, retomada por
 * `ia_batches.job_id`, chave por item em `params.pdisFeitos` (IDS, não nomes) e
 * early-return de `done`.
 *
 * ⚠️ O QUE ESTA TASK MEDE E AS OUTRAS NÃO: `pdf_path`. O `renderToBuffer` do
 * @react-pdf falha quando a fonte foi registrada noutra instância do módulo, e
 * o `catch` do núcleo apenas loga — o relatório é salvo com `pdf_path: null`,
 * `success: true`, e a IA já foi paga. Foi assim que 40 micro-conteúdos
 * nasceram sem PDF em silêncio. Aqui o contador `semPdf` sobe para o progresso
 * e para o resumo final: "43 ok" com 43 sem PDF não pode parecer sucesso.
 */
const MAX_TENTATIVAS = 3;

export const gerarRelatoriosBatchTask = task({
  id: 'gerar-relatorios-batch',
  maxDuration: 3600,
  // Mesmo backoff longo do blueprint: a falha típica é FORNECEDOR, não corrida.
  retry: { maxAttempts: MAX_TENTATIVAS, minTimeoutInMs: 30_000, maxTimeoutInMs: 300_000, factor: 4 },
  run: async (payload: { jobId: string }, { ctx }) => {
    const sb = createSupabaseAdmin();
    const { patch, patchCritico } = criarPatchJob(sb, payload.jobId);

    const { data: job, error: errJob } = await sb.from('ia_jobs').select('*').eq('id', payload.jobId).maybeSingle();
    if (errJob) throw new Error(`não foi possível ler o ia_job ${payload.jobId}: ${errJob.message}`);
    if (!job) throw new Error('ia_job não encontrado: ' + payload.jobId);

    if (job.status === 'done') {
      console.warn(`[gerar-relatorios-batch] job ${payload.jobId} já está done — nada a fazer (reentrância evitada)`);
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

      const feitos = new Set<string>(Array.isArray(pp.pdisFeitos) ? pp.pdisFeitos : []);
      const paramsAcum: Record<string, any> = { ...pp };
      const salvarParams = (novos: Record<string, any>) => {
        Object.assign(paramsAcum, novos);
        return patchCritico({ params: { ...paramsAcum } });
      };

      const resultados: Array<{ colab: string; ok: boolean; error?: string; semPdf?: boolean }> = [];
      let done = 0;
      let semPdf = 0;
      const pushProgress = (current: string) => patch({ progress: { done, total, current, resultados } });
      await patch({ progress: { done: 0, total, current: `lote (batch) — ${total} PDI(s)…`, resultados: [] } });

      // Nomes só para o progresso ser legível. Falha aqui NÃO derruba o lote —
      // seria trocar 43 PDIs por uma lista de rótulos — mas também não passa
      // calada: sem o registro, a tela mostraria UUIDs e pareceria dado
      // faltando no cadastro, mandando quem investiga para o lugar errado.
      const { data: colabs, error: errColabs } = await sb.from('colaboradores')
        .select('id, nome_completo').in('id', colabIds).eq('empresa_id', empresaId);
      if (errColabs) console.error(`[gerar-relatorios-batch] nomes não lidos (${errColabs.message}) — o progresso vai mostrar ids, o lote segue`);
      const nomeById = new Map<string, string>((colabs || []).map((c: any) => [c.id, c.nome_completo]));
      const nome = (id: string) => nomeById.get(id) || id;

      // 1) Requests. `buildRelatorioIndividualReq` aplica o gate "PDI completo"
      //    (todas as competências do top5 avaliadas) — quem não passa entra
      //    como erro NOMEADO, não some da lista.
      const reqs: BatchReq[] = [];
      const buildErr = new Set<string>();
      for (const id of colabIds) {
        const r = await buildRelatorioIndividualReq(sb, { empresaId, colaboradorId: id });
        if ('error' in r) { resultados.push({ colab: nome(id), ok: false, error: r.error }); buildErr.add(id); continue; }
        reqs.push({ customId: id, system: r.system, user: r.user, model, maxTokens: r.maxTokens });
      }

      // 2) Batch destacado. Falha total → mapa vazio → cada um cai no síncrono.
      let respostas = new Map<string, string>();
      const aGerar = reqs.filter((r) => !feitos.has(r.customId));
      if (aGerar.length) {
        let batchIdAtivo: string | null = pp.batchId ?? (await batchPendenteDoJob(payload.jobId, 'pdi_individual'));
        try {
          if (!batchIdAtivo) {
            // MESMA etiqueta do caminho síncrono (`taskKey: 'pdi_individual'`),
            // senão o lote — que passa a ser o caminho padrão — cairia como
            // `feature: 'batch'` no ledger e o custo do PDI ficaria sem dono.
            batchIdAtivo = await createClaudeBatch(aGerar, {
              ledger: { feature: 'pdi_individual', empresaId, jobId: payload.jobId },
            });
            try {
              await salvarParams({ batchId: batchIdAtivo });
            } catch (ePersist: any) {
              console.error(`[gerar-relatorios-batch] batchId ${batchIdAtivo} NÃO persistido (${ePersist?.message}) — segue em memória; rastro em ia_batches`);
            }
          }
          for (let i = 0; i < 24 * 60; i++) {
            const st = await pollClaudeBatch(batchIdAtivo);
            if (st.ended) break;
            await pushProgress(`batch: ${st.counts.succeeded}/${aGerar.length} prontos…`);
            await wait.for({ seconds: 60 });
          }
          respostas = await fetchClaudeBatchResults(batchIdAtivo, { feature: 'pdi_individual', empresaId });
          await encerrarBatch(batchIdAtivo, IA_BATCH.CONCLUIDO);
        } catch (e: any) {
          console.warn(`[gerar-relatorios-batch] batch falhou (${e?.message}) — fallback síncrono por colab`);
          try { if (batchIdAtivo) await encerrarBatch(batchIdAtivo, IA_BATCH.ERRO, e?.message); } catch { /* observabilidade */ }
        }
      }

      // 3) Persiste um a um: resposta do batch OU fallback síncrono.
      const { callAI } = await import('@/actions/ai-client');
      for (const id of colabIds) {
        done++;
        if (buildErr.has(id)) { await pushProgress(`${nome(id)}: pré-requisito faltando`); continue; }
        if (feitos.has(id)) {
          resultados.push({ colab: nome(id), ok: true });
          await pushProgress(`${nome(id)}: de execução anterior`);
          continue;
        }
        const req = reqs.find((r) => r.customId === id)!;
        let texto = respostas.get(id);
        if (!texto || !texto.trim()) {
          try {
            texto = await callAI(req.system, req.user, aiConfig, req.maxTokens, {
              taskKey: 'pdi_individual', empresaId, colaboradorId: id, source: 'batch-sync',
            });
          } catch (e: any) {
            resultados.push({ colab: nome(id), ok: false, error: 'IA falhou: ' + (e?.message || e) });
            await pushProgress(`${nome(id)}: erro de IA`);
            continue;
          }
        }
        // O persist é o MESMO do síncrono (overlay de nível, binding do
        // blueprint, auditoria, PDF, upsert). `built` omitido de propósito: a
        // task não carrega o objeto entre a submissão e o resultado, e
        // reconstruir é a mesma chamada, não um caminho paralelo.
        const r = await persistRelatorioIndividualFromText(sb, { empresaId, colaboradorId: id, texto });
        const faltouPdf = !!r.success && !r.pdfPath;
        if (faltouPdf) semPdf++;
        resultados.push({ colab: nome(id), ok: !!r.success, error: r.error, ...(faltouPdf ? { semPdf: true } : {}) });
        if (r.success) {
          feitos.add(id);
          await salvarParams({ pdisFeitos: [...feitos] });
        }
        await pushProgress(`${nome(id)}: ${r.success ? (faltouPdf ? 'ok, SEM PDF' : 'ok') : 'erro'}${semPdf ? ` · ${semPdf} sem PDF` : ''}`);
      }

      const okCount = resultados.filter((r) => r.ok).length;
      const errCount = resultados.length - okCount;
      // `semPdf` no resumo: relatório salvo sem documento é entrega pela metade,
      // e sem isto ele se apresenta como "ok".
      const resumo = `concluído: ${okCount} ok, ${errCount} erro(s)${semPdf ? `, ${semPdf} SEM PDF` : ''}`;
      await patchCritico({
        status: 'done', error: null,
        result_ids: resultados.filter((r) => r.ok).map((r) => r.colab),
        progress: { done: total, total, current: resumo, resultados },
      });
      return { ok: true, jobId: payload.jobId, okCount, errCount, semPdf };
    } catch (e: any) {
      await registrarFalhaDaTentativa(patch, e, ctx, MAX_TENTATIVAS);
      throw e;
    }
  },
});
