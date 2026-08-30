/**
 * Resolve somente uma versão PERSONALIZADA já pronta para uma célula de vídeo.
 *
 * A geração continua fora deste caminho: abrir a home ou um conteúdo nunca pode
 * disparar custo. Se a saudação nominal não existir (ou a leitura falhar), o
 * chamador mantém o vídeo editorial genérico como fallback.
 */
export type ReadyPersonalizedVideo = {
  bunnyVideoId: string;
  bunnyLibrary: string | number;
};

export async function findReadyPersonalizedVideo(
  sb: any,
  args: {
    empresaId: string | null | undefined;
    colaboradorId: string | null | undefined;
    cargo: string | null | undefined;
    perfilDominante: string | null | undefined;
    moduloBaseId: string | null | undefined;
  },
): Promise<ReadyPersonalizedVideo | null> {
  const disc = String(args.perfilDominante || '').trim().charAt(0).toUpperCase();
  if (!args.empresaId || !args.colaboradorId || !args.cargo || !args.moduloBaseId || !['D', 'I', 'S', 'C'].includes(disc)) {
    return null;
  }

  try {
    const { data: cell, error: cellError } = await sb.from('videos_gerados')
      .select('id')
      .eq('modulo_base_id', args.moduloBaseId)
      .eq('empresa_id', args.empresaId)
      .eq('cargo', args.cargo)
      .eq('disc_dominante', disc)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cellError || !cell?.id) return null;

    const { data: personalized, error: personalizedError } = await sb.from('videos_personalizados')
      .select('bunny_video_id,bunny_library')
      .eq('cell_video_id', cell.id)
      .eq('colaborador_id', args.colaboradorId)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (personalizedError || !personalized?.bunny_video_id) return null;

    return {
      bunnyVideoId: String(personalized.bunny_video_id),
      bunnyLibrary: personalized.bunny_library || process.env.BUNNY_LIBRARY_ID || 636615,
    };
  } catch {
    return null;
  }
}

export function personalizedGreetingCopy(nomeCompleto: string | null | undefined) {
  const firstName = String(nomeCompleto || '').trim().split(/\s+/)[0] || 'Olá';
  return {
    title: `${firstName}, este vídeo é para você`,
    description: 'Uma saudação pessoal para abrir o conteúdo da sua jornada de desenvolvimento.',
  };
}
