import { task } from '@trigger.dev/sdk';
import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Avaliação acumulada do PILOTO em BACKGROUND (Trigger.dev).
 *
 * Antes rodava num after() da reflection sem 2 — frágil (morria no freeze da
 * Vercel; race com o fechamento que lia feedback.acumulado null → B2/R1). Agora:
 * a reflection sem 2 marca a linha da semana da acumulada como 'processing' e
 * dispara esta task; o fechamento (sem 3) só abre quando status='done'. Retry do
 * Trigger + self-heal no gate cobrem falha. Ver análise piloto (M8).
 *
 * DEPLOY: tasks do trigger.dev são deployadas MANUALMENTE (não pelo git push).
 */
export const acumuladaPilotoTask = task({
  id: 'acumulada-piloto',
  maxDuration: 600,               // 2 chamadas de IA sequenciais (8k + 6k)
  retry: { maxAttempts: 3 },
  run: async (payload: { trilhaId: string; semanaAcumulada: number; empresaId: string | null }) => {
    const sb = createSupabaseAdmin();
    const patch = (f: Record<string, unknown>) =>
      sb.from('temporada_semana_progresso').update(f)
        .eq('trilha_id', payload.trilhaId).eq('semana', payload.semanaAcumulada);

    try {
      // dynamic import: evita ciclo de tipos e mantém a task leve. Núcleo headless
      // (sem endpoint); empresaId validado pela reflection (dono da trilha) e
      // revalidado contra a trilha no core (B5).
      const { gerarAvaliacaoAcumuladaCore } = await import('@/lib/season-engine/avaliacao-acumulada-core');
      const r = await gerarAvaliacaoAcumuladaCore(payload.trilhaId, { empresaId: payload.empresaId });
      if (!r?.ok) throw new Error('gerarAvaliacaoAcumulada retornou !ok');
      await patch({ acumulada_status: 'done', acumulada_erro: null });
      return { ok: true, trilhaId: payload.trilhaId };
    } catch (e: any) {
      await patch({ acumulada_status: 'error', acumulada_erro: String(e?.message || e).slice(0, 500) });
      throw e; // deixa o Trigger retentar (maxAttempts)
    }
  },
});
