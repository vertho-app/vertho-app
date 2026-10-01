'use server';

/**
 * Fluxo completo (IA4 → blueprint → auditoria → PDI → trilha → Gestor/RH), disparado por UM botão depois que o
 * admin definiu as competências foco. A PRÉVIA é somente leitura (quem está pronto, quem está bloqueado e por quê, a
 * faixa de custo — antes de gastar qualquer coisa). A EXECUÇÃO enfileira a task `fluxo-completo` (Trigger.dev) e a tela
 * acompanha por `ia_jobs` (fase 'fluxo'). A cadeia NÃO envia nada a pessoas: enviar PDI e iniciar a cadência seguem
 * sendo decisão do dono.
 *
 * Todo export de arquivo 'use server' é um endpoint HTTP: o escopo chega do CLIENTE, então é validado em runtime
 * (zod) e a regra de turma é a MESMA das demais ações em lote (`idsDoEscopoOuFalhar`, fail-closed com 2+ turmas).
 * A coleta e o cálculo vivem em `lib/pipeline-fluxo` (headless), para a orquestração de servidor reusar.
 */
import { z } from 'zod';
import { tasks, runs } from '@trigger.dev/sdk';
import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { tenantDb } from '@/lib/tenant-db';
import { regionOpts } from '@/lib/trigger-region';
import { idsDoEscopoOuFalhar, mensagemEscopoObrigatorio } from '@/lib/turmas/escopo';
import { coletarEntradaPrevia, lerTudoPaginado } from '@/lib/pipeline-fluxo/coletar';
import { montarPreviaFluxo, type PreviaFluxo } from '@/lib/pipeline-fluxo/previa';
import { FASE_FLUXO, TASK_FLUXO, progressoInicial, type ParamsFluxo, type ProgressoFluxo } from '@/lib/pipeline-fluxo/tipos';

const EntradaSchema = z.object({
  empresaId: z.string().min(1),
  turmaId: z.string().min(1).nullish(),
  empresaInteiraJustificativa: z.string().max(500).nullish(),
  cargos: z.array(z.string().min(1).max(200)).max(200).nullish(),
});

export type PreviaFluxoResult =
  | { success: true; previa: PreviaFluxo; cargosFiltrados: string[] }
  | { success: false; error: string; code?: 'ESCOPO_OBRIGATORIO' };

export async function previaFluxoCompleto(input: z.infer<typeof EntradaSchema>): Promise<PreviaFluxoResult> {
  await requireAdminAction('ai.audit.regenerate');
  const parsed = EntradaSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Entrada inválida' };
  const { empresaId, turmaId, empresaInteiraJustificativa, cargos } = parsed.data;

  try {
    const sb = await requireAdminSupabase('ai.audit.regenerate');
    let permitidos: Set<string> | null;
    try {
      permitidos = await idsDoEscopoOuFalhar(sb, empresaId, { turmaId: turmaId || null, empresaInteiraJustificativa: empresaInteiraJustificativa || null });
    } catch (e) {
      const msg = mensagemEscopoObrigatorio(e);
      if (msg) return { success: false, error: msg, code: 'ESCOPO_OBRIGATORIO' };
      throw e;
    }

    const coleta = await coletarEntradaPrevia(tenantDb(empresaId), { permitidos, cargos: cargos || undefined });
    if (coleta.error || !coleta.entrada) return { success: false, error: coleta.error || 'Falha ao coletar o estado da empresa' };
    return { success: true, previa: montarPreviaFluxo(coleta.entrada), cargosFiltrados: cargos || [] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao montar a prévia' };
  }
}

// ───────────────────────── EXECUÇÃO (servidor) ─────────────────────────

const IniciarSchema = EntradaSchema.extend({
  /** Simulação: lê as filas e grava o que FARIA, sem enfileirar nem gerar nada. */
  dryRun: z.boolean().optional(),
});

export type IniciarFluxoResult =
  | { success: true; jobId: string; dryRun: boolean }
  | { success: false; error: string; code?: 'ESCOPO_OBRIGATORIO' | 'JA_RODANDO'; jobId?: string };

export async function iniciarFluxoCompleto(input: z.infer<typeof IniciarSchema>): Promise<IniciarFluxoResult> {
  const ctx = await requireAdminAction('ai.audit.regenerate');
  const parsed = IniciarSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Entrada inválida' };
  const { empresaId, turmaId, empresaInteiraJustificativa, cargos, dryRun } = parsed.data;

  try {
    const sb = await requireAdminSupabase('ai.audit.regenerate');
    const { data: emp, error: errEmp } = await sb.from('empresas').select('id, is_demo').eq('id', empresaId).maybeSingle();
    if (errEmp) return { success: false, error: `Não foi possível ler a empresa: ${errEmp.message}` };
    if (!emp) return { success: false, error: 'Empresa não encontrada' };
    // Demo gasta IA de verdade e não produz nada que alguém use; só a simulação é liberada.
    if (emp.is_demo && !dryRun) return { success: false, error: 'Empresa de demonstração: o fluxo completo só roda em simulação.' };

    const { data: ativo, error: errAtivo } = await sb.from('ia_jobs').select('id')
      .eq('empresa_id', empresaId).eq('fase', FASE_FLUXO).in('status', ['queued', 'running']).limit(1).maybeSingle();
    if (errAtivo) return { success: false, error: `Não foi possível verificar fluxos ativos: ${errAtivo.message}` };
    if (ativo?.id) return { success: false, error: 'Já existe um fluxo completo em andamento nesta empresa.', code: 'JA_RODANDO', jobId: ativo.id };

    let permitidos: Set<string> | null;
    try {
      permitidos = await idsDoEscopoOuFalhar(sb, empresaId, { turmaId: turmaId || null, empresaInteiraJustificativa: empresaInteiraJustificativa || null });
    } catch (e) {
      const msg = mensagemEscopoObrigatorio(e);
      if (msg) return { success: false, error: msg, code: 'ESCOPO_OBRIGATORIO' };
      throw e;
    }

    // Filtro por cargo vira RESTRIÇÃO de ids resolvida AGORA (as filas reais só conhecem ids). Com filtro, o escopo
    // deixa de ser "empresa inteira": Gestor e RH ficam de fora, como numa turma.
    if (cargos?.length) {
      const q = await lerTudoPaginado((de, ate) => tenantDb(empresaId).from('colaboradores').select('id').in('cargo', cargos).order('id').range(de, ate));
      if (q.error) return { success: false, error: `Não foi possível resolver os cargos: ${q.error}` };
      const doCargo = new Set<string>(q.data.map((r: any) => r.id as string));
      permitidos = permitidos ? new Set([...doCargo].filter((id) => permitidos!.has(id))) : doCargo;
    }
    if (permitidos && permitidos.size === 0) return { success: false, error: 'O escopo escolhido não tem nenhuma pessoa.' };

    const params: ParamsFluxo = {
      empresaId,
      escopo: { turmaId: turmaId || null, empresaInteiraJustificativa: empresaInteiraJustificativa || null, cargos: cargos || null },
      permitidos: permitidos ? [...permitidos] : null,
      dryRun: !!dryRun,
      criadoPor: (ctx as any)?.email || null,
    };
    const { data: job, error } = await sb.from('ia_jobs').insert({
      empresa_id: empresaId, fase: FASE_FLUXO, params, status: 'queued', progress: { ...progressoInicial(!!dryRun), atual: 'na fila' },
    }).select('id').single();
    if (error || !job) return { success: false, error: error?.message || 'Falha ao criar o fluxo' };

    try {
      const handle = await tasks.trigger(TASK_FLUXO, { jobId: job.id }, regionOpts());
      const { error: errRun } = await sb.from('ia_jobs').update({ params: { ...params, runId: handle.id } }).eq('id', job.id).eq('empresa_id', empresaId);
      if (errRun) console.error(`[fluxo] runId ${handle.id} NÃO persistido no job ${job.id}: ${errRun.message} — o fluxo roda, mas o cancel não acha o run`);
    } catch (e: any) {
      const { error: errMarca } = await sb.from('ia_jobs').update({ status: 'error', error: 'dispatch: ' + (e?.message || e) }).eq('id', job.id).eq('empresa_id', empresaId);
      if (errMarca) console.error(`[fluxo] job ${job.id} preso em 'queued': ${errMarca.message}`);
      return { success: false, error: 'Não foi possível enfileirar: ' + (e?.message || e) };
    }
    return { success: true, jobId: job.id, dryRun: !!dryRun };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao iniciar o fluxo' };
  }
}

export interface EstadoFluxo {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  erro: string | null;
  progresso: ProgressoFluxo | null;
  criadoEm: string;
  atualizadoEm: string | null;
  dryRun: boolean;
  escopo: ParamsFluxo['escopo'] | null;
}

const IdSchema = z.object({ empresaId: z.string().min(1), jobId: z.string().min(1).optional() });

/** Estado de um fluxo (ou do ÚLTIMO da empresa, sem `jobId`). Somente leitura. */
export async function statusFluxoCompleto(input: z.infer<typeof IdSchema>): Promise<{ success: true; fluxo: EstadoFluxo | null } | { success: false; error: string }> {
  await requireAdminAction();
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Entrada inválida' };
  const { empresaId, jobId } = parsed.data;
  try {
    const sb = await requireAdminSupabase('admin.access');
    let q = sb.from('ia_jobs').select('id, status, error, progress, params, created_at, updated_at')
      .eq('empresa_id', empresaId).eq('fase', FASE_FLUXO);
    if (jobId) q = q.eq('id', jobId);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: true, fluxo: null };
    const p: any = data.params || {};
    return {
      success: true,
      fluxo: {
        jobId: data.id, status: data.status, erro: data.error || null,
        progresso: data.progress && Array.isArray((data.progress as any).etapas) ? (data.progress as ProgressoFluxo) : null,
        criadoEm: data.created_at, atualizadoEm: data.updated_at || null, dryRun: !!p.dryRun, escopo: p.escopo || null,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao ler o fluxo' };
  }
}

/** Cancela o fluxo E os lotes filhos ainda ativos (cancelar só o pai deixaria a IA gastando em segundo plano). */
export async function cancelarFluxoCompleto(input: { empresaId: string; jobId: string }): Promise<{ success: true; cancelados: number } | { success: false; error: string }> {
  await requireAdminAction('ai.audit.regenerate');
  const parsed = z.object({ empresaId: z.string().min(1), jobId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { success: false, error: 'Entrada inválida' };
  const { empresaId, jobId } = parsed.data;
  try {
    const sb = await requireAdminSupabase('ai.audit.regenerate');
    const { data: job, error } = await sb.from('ia_jobs').select('id, params, progress, status')
      .eq('id', jobId).eq('empresa_id', empresaId).eq('fase', FASE_FLUXO).maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!job) return { success: false, error: 'Fluxo não encontrado' };
    if (job.status === 'done' || job.status === 'cancelled' || job.status === 'error') return { success: true, cancelados: 0 };

    const agora = new Date().toISOString();
    const { error: errPai } = await sb.from('ia_jobs').update({ status: 'cancelled', updated_at: agora }).eq('id', jobId).eq('empresa_id', empresaId);
    if (errPai) return { success: false, error: `Não foi possível cancelar: ${errPai.message}` };
    const runPai = (job.params as any)?.runId;
    if (runPai) { try { await runs.cancel(runPai); } catch { /* run já terminou */ } }

    let cancelados = 0;
    const filhos: string[] = ((job.progress as any)?.etapas || []).flatMap((e: any) => e.jobIds || []);
    for (const filho of filhos) {
      const { data: f, error: errLeitura } = await sb.from('ia_jobs').select('id, params, status').eq('id', filho).eq('empresa_id', empresaId).in('status', ['queued', 'running']).maybeSingle();
      if (errLeitura) { console.warn(`[fluxo] lote ${filho} não lido para cancelar: ${errLeitura.message}`); continue; }
      if (!f) continue;
      const { error: errF } = await sb.from('ia_jobs').update({ status: 'cancelled', updated_at: agora }).eq('id', filho).eq('empresa_id', empresaId);
      if (errF) { console.warn(`[fluxo] lote ${filho} não cancelado: ${errF.message}`); continue; }
      cancelados++;
      const runId = (f.params as any)?.runId;
      if (runId) { try { await runs.cancel(runId); } catch { /* idem */ } }
    }
    return { success: true, cancelados };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao cancelar' };
  }
}
