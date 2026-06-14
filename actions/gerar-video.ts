'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { gerarRoteiroDeModulo } from '@/lib/video/gerar-roteiro';
import type { ModuloParaRoteiro } from '@/lib/video/roteiro-prompt';
import { tasks } from '@trigger.dev/sdk';
import type { gerarVideoModuloTask } from '@/trigger/gerar-video-modulo';

/**
 * Dispara a geração de um VÍDEO a partir de um Módulo-Base: gera o roteiro (IA,
 * aqui no app), cria o rastreador videos_gerados e enfileira o job trigger.dev
 * que faz narração (TTS) → avatar (HeyGen) → render (Remotion) → Bunny.
 * `escopoEmpresaId` null = vídeo global/canônico; preenchido = da empresa.
 */
export async function dispararVideoDeModulo(moduloBaseId: string, escopoEmpresaId: string | null = null) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    const ctx = await requireAdminAction('content.manage');
    if (!moduloBaseId) return { error: 'Módulo-base não informado' };

    const { data: m, error } = await sb.from('modulos_base_conteudo')
      .select('id, locale, competencia_base_id, nivel_entrada, nivel_destino, titulo, descritor, conteudo_central, conteudo_aplicavel, adaptacao_por_formato')
      .eq('id', moduloBaseId)
      .maybeSingle();
    if (error || !m) return { error: error?.message || 'Módulo-base não encontrado' };

    let competenciaNome: string | null = null;
    if (m.competencia_base_id) {
      const { data: c } = await sb.from('competencias_base').select('nome').eq('id', m.competencia_base_id).maybeSingle();
      competenciaNome = c?.nome || null;
    }

    const moduloParaRoteiro: ModuloParaRoteiro = {
      titulo: m.titulo,
      descritor: m.descritor,
      competenciaNome,
      nivel_entrada: m.nivel_entrada,
      nivel_destino: m.nivel_destino,
      conteudo_central: m.conteudo_central,
      conteudo_aplicavel: m.conteudo_aplicavel,
      adaptacao_por_formato: m.adaptacao_por_formato,
      locale: m.locale,
    };

    const { roteiro, error: rotErr } = await gerarRoteiroDeModulo(moduloParaRoteiro);
    if (rotErr || !roteiro) return { error: rotErr || 'A IA não retornou um roteiro válido' };

    const { data: novo, error: insErr } = await sb.from('videos_gerados').insert({
      modulo_base_id: moduloBaseId,
      empresa_id: escopoEmpresaId,
      status: 'processing',
      etapa: 'roteiro',
      roteiro,
      created_by: (ctx as any)?.email || null,
    }).select('id').maybeSingle();
    if (insErr || !novo?.id) return { error: insErr?.message || 'Falha ao criar registro do vídeo' };

    try {
      await tasks.trigger<typeof gerarVideoModuloTask>('gerar-video-modulo', { videoId: novo.id, roteiro });
    } catch (e: any) {
      await sb.from('videos_gerados').update({ status: 'error', error: e?.message?.slice(0, 500) }).eq('id', novo.id);
      return { error: `Não foi possível iniciar o processamento: ${e?.message || 'erro'}` };
    }

    return { success: true, id: novo.id, roteiro };
  } catch (err: any) {
    console.error('[dispararVideoDeModulo]', err);
    return { error: err?.message || 'Falha ao disparar a geração de vídeo' };
  }
}

/** Lista os vídeos gerados (e em andamento) de um Módulo-Base. */
export async function listarVideosDoModulo(moduloBaseId: string) {
  try {
    await requireAdminAction();
    const sb = await requireAdminSupabase();
    const { data } = await sb.from('videos_gerados')
      .select('id, status, etapa, video_url, bunny_video_id, bunny_library, error, created_at, updated_at')
      .eq('modulo_base_id', moduloBaseId)
      .order('created_at', { ascending: false })
      .limit(20);
    return { data: data || [] };
  } catch (err: any) {
    console.error('[listarVideosDoModulo]', err);
    return { data: [] };
  }
}

/** Status de um vídeo (para polling da UI). */
export async function statusDoVideo(videoId: string) {
  try {
    await requireAdminAction();
    const sb = await requireAdminSupabase();
    const { data } = await sb.from('videos_gerados')
      .select('id, status, etapa, video_url, bunny_video_id, bunny_library, error, updated_at')
      .eq('id', videoId)
      .maybeSingle();
    return { data };
  } catch (err: any) {
    console.error('[statusDoVideo]', err);
    return { data: null };
  }
}
