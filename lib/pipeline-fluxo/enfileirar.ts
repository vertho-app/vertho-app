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
import type { ResultadoLote, ResultadoKit, KitItem, EsperaKit } from './executor';

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

/**
 * Enfileira UM tema do kit — o que `enqueueKit` faz (insert em `kit_jobs` + task `gerar-kit`), sem sessão, com os
 * formatos e o vídeo decididos pelas preferências de aprendizagem da célula (2 primeiros de cada pessoa, em união). Adota o job ativo do mesmo tema na empresa em vez de
 * duplicar: a varredura do plano não enxerga jobs em voo, então sem adoção um botão manual anterior geraria o mesmo kit
 * duas vezes (e pagaria duas).
 */
export async function enfileirarKit(sb: any, args: { empresaId: string; item: KitItem }): Promise<ResultadoKit> {
  const { empresaId, item } = args;
  // Adota o job ativo do MESMO tema e cargo que já cobre estes DISC (`contains`: o job pode cobrir mais). Só tema não basta:
  // dois grupos do mesmo tema (formatos diferentes) têm DISC disjuntos e não podem adotar o job um do outro.
  const { data: ativo, error: errAtivo } = await sb.from('kit_jobs').select('id')
    .eq('empresa_id', empresaId).eq('competencia', item.competencia).eq('descritor', item.descritor)
    .contains('params', { cargo: item.cargo, discs: item.faltantes })
    .in('status', ['queued', 'running']).limit(1).maybeSingle();
  if (errAtivo) return { erro: `Não foi possível verificar jobs de kit ativos: ${errAtivo.message}` };
  if (ativo?.id) return { jobId: ativo.id, adotado: true };

  const params = {
    nivelMin: item.nivelMin, nivelMax: item.nivelMax, cargo: item.cargo, contexto: item.contexto,
    discs: item.faltantes, formatos: item.formatos, porPreferencia: true,
    // Áudio PRÉ-RENDERIZADO (TTS) quando o podcast está no kit; vídeo só quando está entre os 2 primeiros de alguém da célula.
    renderAudio: item.formatos.includes('audio'), useBatch: item.faltantes.length >= 2, incluirVideo: item.video,
  };
  const { data: job, error } = await sb.from('kit_jobs').insert({
    empresa_id: empresaId, competencia: item.competencia, descritor: item.descritor, params, status: 'queued',
    progress: { done: 0, total: item.faltantes.length, current: 'na fila (fluxo completo)', kits: [] },
  }).select('id').single();
  if (error || !job) return { erro: error?.message || 'Falha ao criar o job de kit' };
  try {
    await tasks.trigger('gerar-kit', { jobId: job.id }, regionOpts());
  } catch (e: any) {
    const { error: errMarca } = await sb.from('kit_jobs').update({ status: 'error', error: 'dispatch: ' + (e?.message || e) }).eq('id', job.id);
    if (errMarca) console.error(`[fluxo] kit_job ${job.id} ficou preso em 'queued' (falha ao marcar erro: ${errMarca.message})`);
    return { erro: 'Não foi possível enfileirar o kit: ' + (e?.message || e) };
  }
  return { jobId: job.id, adotado: false };
}

/** Estado atual dos jobs de kit; `kits` = quantos kits o job de fato publicou (`kit_ids`). Erro de leitura LANÇA. */
export async function lerDesfechoKits(sb: any, jobIds: string[]): Promise<Array<EsperaKit & { terminal: boolean }>> {
  if (!jobIds.length) return [];
  const { data, error } = await sb.from('kit_jobs').select('id, status, error, kit_ids').in('id', jobIds);
  if (error) throw new Error(`kit_jobs: ${error.message}`);
  const porId = new Map<string, any>((data || []).map((r: any) => [r.id, r]));
  return jobIds.map((id) => {
    const r = porId.get(id);
    if (!r) return { jobId: id, status: 'error' as const, erro: 'job de kit não encontrado', kits: 0, terminal: true };
    const terminal = ['done', 'error', 'cancelled'].includes(r.status);
    return { jobId: id, status: (terminal ? r.status : 'error') as 'done' | 'error' | 'cancelled', erro: r.error || undefined, kits: Array.isArray(r.kit_ids) ? r.kit_ids.length : 0, terminal };
  });
}
