/**
 * Enfileira os lotes que o fluxo completo usa (IA4, blueprint, PDI) SEM a trava de sessão — o orquestrador roda numa
 * task do Trigger.dev, que não tem sessão. Faz o MESMO que `enqueueIA4Batch` / `enqueueBlueprintBatch` /
 * `enqueueRelatoriosBatch` (`actions/ia-pipeline-batch.ts`): insere o `ia_jobs` com os mesmos `params` e dispara a
 * mesma task. O que muda: quem chama já foi autorizado (a action do botão) e as filas já vêm resolvidas com escopo.
 *
 * Regra do "um lote por fase por empresa" (`jaTemLoteAtivo`): se JÁ existe um lote ativo da mesma fase (alguém apertou
 * o botão manual antes), o fluxo ADOTA esse lote e espera por ele, em vez de falhar ou abrir outro (dois lotes da
 * mesma fase processariam a mesma fila em corrida).
 */
import { tasks } from '@trigger.dev/sdk';
import { regionOpts } from '@/lib/trigger-region';
import type { ResultadoLote } from './executor';

type EtapaLote = 'ia4' | 'blueprint' | 'relatorios';

const TASK_DO_LOTE: Record<EtapaLote, string> = {
  ia4: 'gerar-ia4-batch',
  blueprint: 'gerar-blueprint-batch',
  relatorios: 'gerar-relatorios-batch',
};

export async function enfileirarLote(
  sb: any,
  args: { empresaId: string; etapa: EtapaLote; itens?: string[]; checkOnly?: string[]; colabIds?: string[]; aiConfig: Record<string, unknown> },
): Promise<ResultadoLote> {
  const { empresaId, etapa, aiConfig } = args;

  const { data: ativo, error: errAtivo } = await sb.from('ia_jobs').select('id')
    .eq('empresa_id', empresaId).eq('fase', etapa).in('status', ['queued', 'running']).limit(1).maybeSingle();
  if (errAtivo) return { erro: `Não foi possível verificar lotes ativos: ${errAtivo.message}` };
  if (ativo?.id) return { jobId: ativo.id, adotado: true };

  let params: Record<string, unknown>;
  let total: number;
  if (etapa === 'ia4') {
    const itens = (args.itens || []).map((id) => ({ id }));
    const checkOnlyIds = args.checkOnly || [];
    params = { aiConfig, items: itens, checkOnlyIds };
    total = itens.length * (aiConfig?.checkModel ? 2 : 1) + (aiConfig?.checkModel ? checkOnlyIds.length : 0);
  } else {
    const colabIds = args.colabIds || [];
    params = { aiConfig, colabIds };
    total = colabIds.length;
  }

  const { data: job, error } = await sb.from('ia_jobs').insert({
    empresa_id: empresaId, fase: etapa, params, status: 'queued',
    progress: { done: 0, total, current: 'na fila (fluxo completo)', resultados: [] },
  }).select('id').single();
  if (error || !job) return { erro: error?.message || 'Falha ao criar o lote' };

  try {
    const handle = await tasks.trigger(TASK_DO_LOTE[etapa], { jobId: job.id }, regionOpts());
    // A task já foi disparada e vai gerar (e cobrar): falhar ao guardar o runId NÃO pode virar "não enfileirou"
    // (alguém clicaria de novo e pagaria duas vezes). O que se perde é só o cancelamento pelo runId.
    const { error: errRun } = await sb.from('ia_jobs').update({ params: { ...params, runId: handle.id } }).eq('id', job.id);
    if (errRun) console.error(`[fluxo] runId ${handle.id} NÃO persistido no job ${job.id}: ${errRun.message} — o lote roda, mas o cancel não acha o run`);
  } catch (e: any) {
    const { error: errMarca } = await sb.from('ia_jobs').update({ status: 'error', error: 'dispatch: ' + (e?.message || e) }).eq('id', job.id);
    if (errMarca) console.error(`[fluxo] job ${job.id} ficou preso em 'queued' (falha ao marcar erro: ${errMarca.message})`);
    return { erro: 'Não foi possível enfileirar: ' + (e?.message || e) };
  }
  return { jobId: job.id, adotado: false };
}

/** Lê o desfecho de um `ia_jobs`: status terminal e a contagem de itens ok/falhos do `progress.resultados`. */
export async function lerDesfechoDoJob(sb: any, jobId: string): Promise<{ terminal: boolean; status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'; erro?: string; ok?: number; falhas?: number }> {
  const { data, error } = await sb.from('ia_jobs').select('status, error, progress').eq('id', jobId).maybeSingle();
  if (error) throw new Error(`ia_jobs ${jobId}: ${error.message}`);
  if (!data) return { terminal: true, status: 'error', erro: 'lote não encontrado' };
  const terminal = ['done', 'error', 'cancelled'].includes(data.status);
  const res: any[] = Array.isArray(data.progress?.resultados) ? data.progress.resultados : [];
  const ok = res.filter((r) => r?.ok).length;
  return { terminal, status: data.status, erro: data.error || undefined, ok, falhas: res.length - ok };
}
