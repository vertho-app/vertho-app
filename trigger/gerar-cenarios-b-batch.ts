import { task, wait } from '@trigger.dev/sdk';
import { tenantDb } from '@/lib/tenant-db';
import { criarPatchJob, registrarFalhaDaTentativa } from '@/lib/ia-jobs';
import { normalizarCheckCenB, validarCenarioB } from '@/lib/cenarios-b';
import { buildCenarioBPrompts, buildCheckCenarioBUser, SYSTEM_CHECK_CENARIO_B } from '@/lib/cenarios-b-prompt';
import { prepararCenariosB, salvarCenarioB, salvarCheckCenarioB, type ItemCenarioB } from '@/lib/cenarios-b-lote';
import { extractJSON } from '@/actions/utils';
import {
  createClaudeBatch, createOpenAIBatch, pollClaudeBatch, pollOpenAIBatch,
  fetchClaudeBatchResults, fetchOpenAIBatchResults, batchPendenteDoJob, encerrarBatch, type BatchReq,
} from '@/lib/ai-batch';
import { IA_BATCH } from '@/lib/status';

const MAX_TENTATIVAS = 3;

/** Duas ondas pagas, com ids persistidos e retomada a partir dos cenários gravados. */
export const gerarCenariosBBatchTask = task({
  id: 'gerar-cenarios-b-batch',
  maxDuration: 3600,
  retry: { maxAttempts: MAX_TENTATIVAS, minTimeoutInMs: 30_000, maxTimeoutInMs: 300_000, factor: 4 },
  run: async (payload: { jobId: string; empresaId: string }, { ctx }) => {
    const tdb = tenantDb(payload.empresaId);
    const { patch, patchCritico } = criarPatchJob(tdb, payload.jobId);
    const { data: job, error } = await tdb.from('ia_jobs').select('*').eq('id', payload.jobId).single();
    if (error || !job || job.fase !== 'cenarios-b') throw new Error('Job de cenários B não encontrado nesta empresa');
    if (job.status === 'done' || job.status === 'cancelled') return { ok: true, reentrante: true };
    // Sem disparos simultâneos: se OUTRA execução já assumiu este job (`params.runId` de uma run
    // diferente e o job em curso), esta é um disparo duplicado e não paga lote nenhum. A retentativa
    // da MESMA run mantém o `runId`, então segue normalmente (é como o lote retoma de onde parou).
    if (job.status === 'running' && job.params?.runId && job.params.runId !== ctx.run.id) {
      return { ok: true, duplicada: true, runDoLote: job.params.runId };
    }
    const params = { ...job.params, runId: ctx.run.id };
    const salvarParams = async (novos: Record<string, unknown>) => {
      Object.assign(params, novos);
      await patchCritico({ params: { ...params } });
    };
    const verificarCancelamento = async () => {
      const { data, error: erroStatus } = await tdb.from('ia_jobs').select('status').eq('id', payload.jobId).single();
      if (erroStatus || !data) throw new Error(`Falha ao consultar job: ${erroStatus?.message || 'não encontrado'}`);
      if (data.status === 'cancelled') throw new Error('CENARIOS_B_CANCELLED');
    };
    const resultados: Array<{ cargo: string; ok: boolean; message?: string; error?: string }> = [];
    const items: ItemCenarioB[] = params.items || [];
    const total = items.length * 2;
    let done = 0;
    const progresso = (current: string) => patch({ progress: { done, total, current, resultados } });

    try {
      await patchCritico({ status: 'running', params });
      const { model, checkModel } = params.aiConfig || {};
      if (!model?.startsWith('claude') || !checkModel?.startsWith('gpt')) throw new Error('Lote requer geração Claude e validação GPT');
      const preparados = await prepararCenariosB(payload.empresaId, items);

      async function executarOnda(reqs: BatchReq[], etapa: 'Gen' | 'Chk') {
        if (!reqs.length) return new Map<string, string>();
        await verificarCancelamento();
        const feature = etapa === 'Gen' ? 'cenarios_b' : 'cenarios_b_check';
        const ledger = { feature, empresaId: payload.empresaId, jobId: payload.jobId };
        const campo = `batchId${etapa}`;
        let batchId: string = params[campo] || await batchPendenteDoJob(payload.jobId, feature);
        if (!batchId) {
          batchId = etapa === 'Gen'
            ? await createClaudeBatch(reqs, { ledger: ledger })
            : await createOpenAIBatch(reqs, { ledger: ledger });
        }
        // Se a persistência falhar, a task retenta e recupera o lote pelo rastro.
        // Não transforma um erro de banco numa segunda geração paga.
        await salvarParams({ [campo]: batchId });
        for (let i = 0; i < 24 * 60; i++) {
          await verificarCancelamento();
          if (etapa === 'Gen') {
            const estado = await pollClaudeBatch(batchId);
            if (estado.ended) {
              const respostas = await fetchClaudeBatchResults(batchId, ledger);
              await encerrarBatch(batchId, IA_BATCH.CONCLUIDO);
              return respostas;
            }
          } else {
            const estado = await pollOpenAIBatch(batchId);
            if (estado.ended) {
              if (estado.status !== 'completed' || !estado.outputFileId) {
                await encerrarBatch(batchId, IA_BATCH.ERRO, `Check em lote terminou como ${estado.status}`);
                throw new Error(`Check em lote terminou como ${estado.status}`);
              }
              const respostas = await fetchOpenAIBatchResults(estado.outputFileId, ledger);
              await encerrarBatch(batchId, IA_BATCH.CONCLUIDO);
              return respostas;
            }
          }
          await progresso(etapa === 'Gen' ? 'Geração em lote: aguardando resultados…' : 'Validação em lote: aguardando resultados…');
          await wait.for({ seconds: 60 });
        }
        throw new Error('Lote não terminou em 24 horas; os ids foram preservados para retomada');
      }

      await progresso('Preparando cenários B…');
      const reqsGen = preparados.filter(p => !p.cenB).map(p => ({
        customId: `g_${p.item.cenarioAId}`,
        ...buildCenarioBPrompts(p.ctx, p.cenA),
        model, maxTokens: 32768,
      }));
      const gerados = await executarOnda(reqsGen, 'Gen');
      for (const p of preparados) {
        await verificarCancelamento();
        const cargo = `${p.comp.nome} (${p.item.cargo})`;
        if (!p.cenB) {
          const resposta = await extractJSON(gerados.get(`g_${p.item.cenarioAId}`) || '');
          const erros = validarCenarioB(resposta, p.cenA);
          if (erros.length) {
            resultados.push({ cargo, ok: false, error: erros.join('; ') });
          } else {
            // Erro de persistência interrompe a tentativa; a retomada usa o mesmo lote.
            p.cenB = await salvarCenarioB(payload.empresaId, p.cenA, resposta);
            resultados.push({ cargo, ok: true, message: 'Cenário B gerado em lote' });
          }
        } else {
          resultados.push({ cargo, ok: true, message: 'Cenário B existente preservado' });
        }
        done++;
        await progresso(`Geração: ${cargo}`);
      }

      // ids baseados no A: permanecem iguais mesmo se só parte do lote foi salva.
      const reqsCheck = preparados.filter(p => p.cenB && p.cenB.nota_check == null).map(p => ({
        customId: `c_${p.item.cenarioAId}`,
        system: SYSTEM_CHECK_CENARIO_B, user: buildCheckCenarioBUser(p.ctx, p.cenB, p.cenA),
        model: checkModel, maxTokens: 4096,
      }));
      const checks = await executarOnda(reqsCheck, 'Chk');
      for (const p of preparados) {
        await verificarCancelamento();
        if (p.cenB && p.cenB.nota_check == null) {
          const resposta = await extractJSON(checks.get(`c_${p.item.cenarioAId}`) || '');
          if (!normalizarCheckCenB(resposta)) {
            resultados.push({ cargo: p.item.cargo, ok: false, error: 'Validação não retornou nota válida; cenário preservado para nova checagem' });
          } else {
            const check = await salvarCheckCenarioB(payload.empresaId, p.cenB.id, resposta);
            resultados.push({ cargo: p.item.cargo, ok: true, message: `Check: ${check.resultado.nota}pts — ${check.statusCheck}` });
          }
        }
        done++;
        await progresso(`Validação: ${p.item.cargo}`);
      }
      await verificarCancelamento();
      const errCount = resultados.filter(r => !r.ok).length;
      await patchCritico({
        status: 'done', error: null, result_ids: preparados.filter(p => p.cenB).map(p => p.cenB.id),
        progress: { done: total, total, current: `Concluído: ${errCount} erro(s)`, resultados },
      });
      return { ok: true, errCount };
    } catch (err: any) {
      if (err?.message === 'CENARIOS_B_CANCELLED') return { ok: false, cancelled: true };
      await registrarFalhaDaTentativa(patch, err, ctx, MAX_TENTATIVAS);
      throw err;
    }
  },
});
