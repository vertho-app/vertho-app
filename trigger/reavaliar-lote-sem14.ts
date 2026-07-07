import { task } from '@trigger.dev/sdk';
import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Lote de REAVALIAÇÃO da Sem 14 em BACKGROUND (Trigger.dev).
 *
 * A reavaliação individual (regerarScoringComFeedback) custa ~2 chamadas de IA
 * (~2-3 min). Reavaliar N avaliações num único request/server-action excederia
 * o maxDuration da Vercel — por isso o lote roda aqui, com status rastreável na
 * tabela auditoria_reavaliacao_lote (mig 170) que o admin polla pra ver progresso.
 *
 * Erros por item NÃO abortam o lote: são anexados em `erros[]` e o resto segue.
 * Retry só no nível do lote (maxAttempts 1) — um item que falha volta como erro,
 * não como retry cego (que reprocessaria os que já deram certo).
 *
 * DEPLOY: tasks do trigger.dev são deployadas MANUALMENTE (não pelo git push).
 */
export const reavaliarLoteSem14Task = task({
  id: 'reavaliar-lote-sem14',
  maxDuration: 1800,              // 10 itens × ~2-3 min de IA (cabe com folga)
  retry: { maxAttempts: 1 },
  run: async (payload: { loteId: string; progressoIds: string[]; empresaId: string | null }) => {
    const sb = createSupabaseAdmin();
    const { loteId, progressoIds, empresaId } = payload;

    // Patch incremental do lote (processados + erros).
    const patch = (f: Record<string, unknown>) =>
      sb.from('auditoria_reavaliacao_lote').update({ ...f, atualizado_em: new Date().toISOString() }).eq('id', loteId);

    const erros: Array<{ progressoId: string; colaborador?: string; error: string }> = [];
    let processados = 0;

    // Busca nomes pra contextuar erros no log do admin.
    const { data: progs } = await sb.from('temporada_semana_progresso')
      .select('id, colaborador_id, colaboradores(nome_completo)')
      .in('id', progressoIds);
    const nomePorId = new Map<string, string>(
      (progs || []).map((p: any) => [p.id, p.colaboradores?.nome_completo || '']),
    );

    for (const id of progressoIds) {
      try {
        // internal={empresaId}: a task não tem sessão. empresaId null (platform
        // admin) pula o assert de tenant; setado rejeita trilha de outro tenant.
        const { regerarScoringComFeedback } = await import('@/app/admin/vertho/auditoria-sem14/actions');
        const r = await regerarScoringComFeedback(id, { empresaId });
        if (r?.error) throw new Error(r.error);
      } catch (e: any) {
        erros.push({ progressoId: id, colaborador: nomePorId.get(id), error: String(e?.message || e).slice(0, 300) });
      }
      processados += 1;
      await patch({ processados, erros });
    }

    await patch({ status: 'done', processados, erros });
    return { ok: true, loteId, processados, erros: erros.length };
  },
});
