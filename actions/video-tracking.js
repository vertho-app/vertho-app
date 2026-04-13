'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Registra um evento de reprodução de vídeo Bunny capturado via
 * postMessage do iframe (no VideoModal). Grava em videos_watched
 * com atribuição ao colaborador.
 *
 * Tipos de evento registrados:
 * - 'play_started' — primeira vez que o vídeo começa a tocar
 * - 'play_finished' — chegou ao fim (evento `ended` do player)
 * - 'progress' — atualizações periódicas de tempo (opcional)
 */
export async function registrarVideoWatched({
  colaboradorId,
  videoId,
  eventType,
  secondsWatched,
  videoLength,
} = {}) {
  try {
    if (!colaboradorId || !videoId || !eventType) {
      return { error: 'Dados incompletos' };
    }

    const sb = createSupabaseAdmin();

    // Denormaliza empresa_id pra facilitar queries por empresa
    const { data: c } = await sb.from('colaboradores')
      .select('empresa_id')
      .eq('id', colaboradorId)
      .maybeSingle();

    const { error } = await sb.from('videos_watched').insert({
      colaborador_id: colaboradorId,
      empresa_id: c?.empresa_id || null,
      video_id: videoId,
      event_type: eventType,
      seconds_watched: Math.round(Number(secondsWatched) || 0) || null,
      video_length: Math.round(Number(videoLength) || 0) || null,
      raw_payload: { source: 'iframe-postmessage' },
    });
    if (error) {
      console.error('[registrarVideoWatched] insert:', error.message);
      return { error: error.message };
    }

    return { ok: true };
  } catch (err) {
    console.error('[registrarVideoWatched]', err);
    return { error: err?.message || 'Erro' };
  }
}
