import { task } from '@trigger.dev/sdk';
import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Geração de Kit Semanal em BACKGROUND. A tela enfileira (actions/kits enqueueKit
 * cria kit_jobs + dispara este task) e faz polling de kit_jobs.progress. Aqui
 * usamos um cliente service-role (sem auth de request) e o callback de progresso
 * vai atualizando o job. Ver docs/KIT-SEMANAL.md.
 */
export const gerarKitTask = task({
  id: 'gerar-kit',
  maxDuration: 3600, // até 1h (lote 4 DISC × 4 formatos, com expansão/PDF)
  run: async (payload: { jobId: string }) => {
    const sb = createSupabaseAdmin();
    const patch = (f: Record<string, unknown>) =>
      sb.from('kit_jobs').update({ ...f, updated_at: new Date().toISOString() }).eq('id', payload.jobId);

    const { data: job } = await sb.from('kit_jobs').select('*').eq('id', payload.jobId).maybeSingle();
    if (!job) throw new Error('kit_job não encontrado: ' + payload.jobId);
    await patch({ status: 'running' });

    try {
      const { gerarKitSemanal } = await import('@/actions/kits'); // dynamic: evita ciclo de tipos
      const pp: any = job.params || {};
      const r = await gerarKitSemanal({
        competencia: job.competencia, descritor: job.descritor,
        nivelMin: pp.nivelMin, nivelMax: pp.nivelMax, cargo: pp.cargo, contexto: pp.contexto,
        empresaId: job.empresa_id, discs: pp.discs, renderAudio: pp.renderAudio,
        useBatch: pp.useBatch, incluirVideo: pp.incluirVideo,
        sb,
        onProgress: async (prog) => { await patch({ progress: prog }); },
      });
      const totalDiscs = (pp.discs || []).length;
      await patch({
        status: r.success ? 'done' : 'error',
        error: (r as any).error || null,
        kit_ids: ((r as any).kits || []).map((k: any) => k.kitId).filter(Boolean),
        progress: { done: totalDiscs, total: totalDiscs, current: (r as any).message || 'concluído', kits: (r as any).kits || [] },
      });
      return { ok: r.success, jobId: payload.jobId };
    } catch (e: any) {
      await patch({ status: 'error', error: String(e?.message || e).slice(0, 500) });
      throw e;
    }
  },
});
