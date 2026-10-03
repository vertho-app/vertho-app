import { task, tasks, wait } from '@trigger.dev/sdk';
import { criarPatchJob, registrarFalhaDaTentativa } from '@/lib/ia-jobs';
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { comContexto } from '@/lib/execucao-contexto';
import { regionOpts } from '@/lib/trigger-region';
import { getModelForTask } from '@/lib/ai-tasks';
import { auditarBlueprintCore } from '@/lib/blueprint/core';
import { gerarTemporadaCoreHeadless } from '@/lib/season-engine/trilha-core';
import { gerarRelatorioGestorCore, gerarRelatorioRHCore } from '@/lib/relatorios/gestor-rh-core';
import { executarFluxo, type DepsFluxo } from '@/lib/pipeline-fluxo/executor';
import { enfileirarLote, enfileirarKit, lerDesfechoDoJob, lerDesfechoKits } from '@/lib/pipeline-fluxo/enfileirar';
import { filaIA4Escopo, filaBlueprintEscopo, filaPdiEscopo, filaTrilhaEscopo, filaAuditoriaEscopo, filaKitEscopo } from '@/lib/pipeline-fluxo/filas';
import { TASK_FLUXO, type ParamsFluxo, type ProgressoFluxo } from '@/lib/pipeline-fluxo/tipos';

/**
 * FLUXO COMPLETO em background: IA4+check → blueprint → auditoria → PDI → trilha → kit (sem vídeo) → Gestor → RH, depois que o admin
 * definiu as competências foco (esse passo continua humano). Só a FIAÇÃO mora aqui; o controle de fluxo (ordem, pulos,
 * cancelamento, continuação, simulação) está em `lib/pipeline-fluxo/executor.ts`, testado sem rede.
 *
 * Os lotes (IA4, blueprint, PDI) são as MESMAS tasks dos botões manuais, disparadas por `enfileirarLote`; esta task só
 * espera por elas com `wait.for` (checkpoint do Trigger: a espera não conta como compute). Esta task não envia nada a
 * pessoas, mas o que ela gera chega a elas: o PDI novo é anunciado depois pelo cron `avisar_planos` (menos o
 * reprovado pela 2ª IA, que fica retido, R-60), e avaliação sem o check da 2ª IA segura o PDI na fila (R-59).
 * Iniciar a cadência continua decisão do dono.
 *
 * Orçamento: ~45 min de COMPUTE por execução (auditoria, trilha, relatórios). Se acabar, a task se re-agenda com o
 * mesmo `jobId` e a fila é recalculada lá — por isso a continuação é idempotente.
 */
const MAX_TENTATIVAS = 2;
const ORCAMENTO_COMPUTE_MS = 45 * 60_000;
/** Teto de espera por UM lote (a Batch API leva até 24 h). */
const ESPERA_MAX_MS = 24 * 3600_000;
const SONDAGEM_S = 60;

const CHAVES_MODELO = ['ia4_avaliacao', 'ia4_check', 'blueprint_gerar', 'pdi_individual', 'temporada_desafio', 'relatorio_gestor', 'relatorio_rh'] as const;

export const fluxoCompletoTask = task({
  id: TASK_FLUXO,
  maxDuration: 3600 * 4,
  retry: { maxAttempts: MAX_TENTATIVAS, minTimeoutInMs: 30_000, maxTimeoutInMs: 120_000, factor: 3 },
  run: async (payload: { jobId: string }, { ctx }) =>
    comContexto({ runtime: 'trigger', orcamentoMs: 3600 * 4 * 1000, onde: TASK_FLUXO }, async () => {
      const sb = createSupabaseAdmin();
      const { patch, patchCritico } = criarPatchJob(sb, payload.jobId);

      const { data: job, error: errJob } = await sb.from('ia_jobs').select('*').eq('id', payload.jobId).maybeSingle();
      if (errJob) throw new Error(`não foi possível ler o ia_job ${payload.jobId}: ${errJob.message}`);
      if (!job) throw new Error('ia_job não encontrado: ' + payload.jobId);
      if (job.status === 'done' || job.status === 'cancelled') {
        return { ok: true, jobId: payload.jobId, reentrante: true };
      }
      await patch({ status: 'running' });

      try {
        const params = job.params as ParamsFluxo;
        const empresaId = params.empresaId;
        if (!empresaId || job.empresa_id !== empresaId) throw new Error('params do fluxo inconsistentes com o ia_job');
        const permitidos = params.permitidos ? new Set(params.permitidos) : null;
        const tdb = tenantDb(empresaId);

        const cancelado = async () => {
          const { data, error } = await sb.from('ia_jobs').select('status').eq('id', payload.jobId).maybeSingle();
          if (error) { console.warn(`[fluxo] não li o status do job: ${error.message}`); return false; }
          return data?.status === 'cancelled';
        };

        const deps: DepsFluxo = {
          ler: {
            ia4: () => filaIA4Escopo(tdb, permitidos),
            blueprint: () => filaBlueprintEscopo(tdb, permitidos),
            auditoria: (alvo) => filaAuditoriaEscopo(tdb, alvo),
            pdi: () => filaPdiEscopo(tdb, permitidos),
            trilha: () => filaTrilhaEscopo(tdb, permitidos, params.excecaoInternos),
            // RAW de propósito: a varredura do plano precisa enxergar também os kits GLOBAIS (empresa_id nulo).
            kit: () => filaKitEscopo(sb, empresaId, { turmaId: params.escopo?.turmaId, cargos: params.escopo?.cargos, semanaMax: params.kitSemanaMax }),
          },
          // Modelo IMPRESSO por etapa: `callAI` não consulta `getModelForTask`, então quem decide é este mapa, e ele
          // vai para o `progress` (config declarada não é config aplicada).
          modelos: async () => {
            const out: Record<string, string> = {};
            for (const k of CHAVES_MODELO) out[k] = String(await getModelForTask(empresaId, k));
            return out;
          },
          lote: (etapa, args) => enfileirarLote(sb, { empresaId, etapa, ...args }),
          aguardarJob: async (jobId) => {
            const inicio = Date.now();
            for (;;) {
              const d = await lerDesfechoDoJob(sb, jobId);
              if (d.terminal) return { status: d.status as 'done' | 'error' | 'cancelled', erro: d.erro, ok: d.ok, falhas: d.falhas };
              if (await cancelado()) return { status: 'cancelled' };
              if (Date.now() - inicio > ESPERA_MAX_MS) return { status: 'error', erro: 'o lote passou de 24 h sem terminar' };
              await wait.for({ seconds: SONDAGEM_S });
            }
          },
          kitEnfileirar: (item) => enfileirarKit(sb, { empresaId, item }),
          aguardarKits: async (jobIds) => {
            const inicio = Date.now();
            for (;;) {
              const estados = await lerDesfechoKits(sb, jobIds);
              if (estados.every((x) => x.terminal)) return estados.map(({ terminal, ...x }) => x);
              if (await cancelado()) return estados.map(({ terminal, ...x }) => (terminal ? x : { ...x, status: 'cancelled' as const }));
              if (Date.now() - inicio > ESPERA_MAX_MS) return estados.map(({ terminal, ...x }) => (terminal ? x : { ...x, status: 'error' as const, erro: 'o kit passou de 24 h sem terminar' }));
              await wait.for({ seconds: SONDAGEM_S });
            }
          },
          auditar: async (colaboradorId) => {
            const r: any = await auditarBlueprintCore(sb as any, { colaboradorId, empresaIdEsperado: empresaId });
            return r?.error ? { ok: false, erro: String(r.error) } : { ok: true };
          },
          gerarTrilha: async (colaboradorId, aiConfig) => {
            const r: any = await gerarTemporadaCoreHeadless(sb, { colaboradorId, aiConfig, empresaIdEsperado: empresaId });
            return r?.error ? { ok: false, erro: String(r.error) } : { ok: true };
          },
          relatorioGestor: async (aiConfig) => {
            const r = await gerarRelatorioGestorCore(sb as any, empresaId, aiConfig as any);
            const det = r.detalhes || [];
            return r.success
              ? { ok: true, gerados: det.filter((d: any) => d.ok).length || 1, erros: det.filter((d: any) => !d.ok).length }
              : { ok: false, erro: r.error };
          },
          relatorioRh: async (aiConfig) => {
            const r = await gerarRelatorioRHCore(sb as any, empresaId, aiConfig as any);
            return r.success ? { ok: true } : { ok: false, erro: r.error };
          },
          cancelado,
          gravar: async (p: ProgressoFluxo) => { await patch({ progress: p }); },
          agora: () => Date.now(),
        };

        const inicial = (job.progress && Array.isArray((job.progress as any).etapas)) ? (job.progress as ProgressoFluxo) : null;
        const r = await executarFluxo(params, inicial, deps, { orcamentoMs: ORCAMENTO_COMPUTE_MS, concorrencia: 3 });

        if (r.resultado === 'cancelado') {
          await patch({ status: 'cancelled', progress: { ...r.progresso, atual: 'cancelado' } });
          return { ok: true, jobId: payload.jobId, cancelado: true };
        }
        if (r.resultado === 'continuar') {
          // Re-agenda a própria task com o MESMO job: a fila é recalculada e só o que falta roda.
          await tasks.trigger(TASK_FLUXO, { jobId: payload.jobId }, regionOpts());
          return { ok: true, jobId: payload.jobId, continua: true };
        }
        // Checkpoint: `done` perdido deixaria o job `running` para sempre (tela em polling e fase travada pelo guard de lote ativo).
        await patchCritico({ status: 'done', progress: r.progresso });
        return { ok: true, jobId: payload.jobId };
      } catch (err: any) {
        console.error(`[${TASK_FLUXO}] job ${payload.jobId}:`, err?.message || err);
        await registrarFalhaDaTentativa(patch, err, ctx as any, MAX_TENTATIVAS);
        throw err;
      }
    }),
});
