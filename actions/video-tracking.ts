'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Registra um evento de reprodução de vídeo Bunny capturado via
 * postMessage do iframe (no VideoModal). Grava em videos_watched
 * com atribuição ao colaborador.
 *
 * Se o evento for 'play_finished' e o vídeo estiver associado a algum
 * curso da trilha do colab (via `cursos[].bunny_video_id`), marca esse
 * curso como concluído em temporada_semana_progresso.conteudo_consumido.
 */
interface VideoWatchedParams {
  colaboradorId: string;
  videoId: string;
  eventType: string;
  secondsWatched?: number | string;
  videoLength?: number | string;
}

export async function registrarVideoWatched({
  colaboradorId,
  videoId,
  eventType,
  secondsWatched,
  videoLength,
}: VideoWatchedParams = {} as any) {
  try {
    if (!colaboradorId || !videoId || !eventType) {
      return { error: 'Dados incompletos' };
    }

    const sb = createSupabaseAdmin();

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

    // Se vídeo concluído, tentar marcar pílula correspondente como feita
    if (eventType === 'play_finished' && c?.empresa_id) {
      // Fire-and-forget (não bloqueia a resposta pro client)
      concluirPilulaSeMapeada(colaboradorId, c.empresa_id, videoId).catch(err => {
        console.warn('[registrarVideoWatched] concluir pílula falhou:', err?.message);
      });
    }

    return { ok: true };
  } catch (err) {
    console.error('[registrarVideoWatched]', err);
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Se `videoId` corresponder a um curso da trilha do colab (coluna
 * `cursos[].bunny_video_id`), marca esse curso como concluído em
 * `temporada_semana_progresso.conteudo_consumido`. Operação idempotente.
 *
 * Pra habilitar a integração, o admin precisa editar a trilha e adicionar
 * `bunny_video_id: "<guid>"` em cada item de `cursos`. Sem essa chave
 * presente, essa função não faz nada (opt-in).
 */
async function concluirPilulaSeMapeada(colaboradorId, empresaId, videoId) {
  const sb = createSupabaseAdmin();

  const { data: trilha } = await sb.from('trilhas')
    .select('id, cursos')
    .eq('colaborador_id', colaboradorId)
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!trilha?.cursos) return;
  const cursos = Array.isArray(trilha.cursos) ? trilha.cursos : [];

  // Procura o curso cujo bunny_video_id bate com o videoId assistido
  const idxMatch = cursos.findIndex(c => c?.bunny_video_id === videoId);
  if (idxMatch < 0) return;

  const semanaMatch = cursos[idxMatch]?.semana || (idxMatch + 1);

  // Atualiza conteudo_consumido em temporada_semana_progresso
  const { data: progresso } = await sb.from('temporada_semana_progresso')
    .select('id, conteudo_consumido')
    .eq('colaborador_id', colaboradorId)
    .eq('empresa_id', empresaId)
    .eq('semana', semanaMatch)
    .maybeSingle();
  if (!progresso) return;

  const arr = Array.isArray(progresso.conteudo_consumido) ? [...progresso.conteudo_consumido] : [];
  const j = arr.findIndex(p => p?.semana === semanaMatch);
  if (j >= 0) {
    if (arr[j].concluido) return; // já concluído
    arr[j] = { ...arr[j], concluido: true, concluido_em: new Date().toISOString() };
  } else {
    arr.push({ semana: semanaMatch, concluido: true, concluido_em: new Date().toISOString() });
  }

  await sb.from('temporada_semana_progresso')
    .update({ conteudo_consumido: arr })
    .eq('id', progresso.id);
}
