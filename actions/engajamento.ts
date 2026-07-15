'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUserAction, requireAdminAction } from '@/lib/auth/action-context';

/**
 * Telemetria de engajamento da trilha. Duas frentes:
 *  - registrarAberturaSemana: loga QUEM ABRIU o deep-link da pílula (com atribuição
 *    por pílula/formato). Novo sinal — o playback de vídeo já vive em videos_watched.
 *  - getEngajamentoEmpresa: junta aberturas (trilha_eventos) + playback de vídeo
 *    (videos_watched) + consumo explícito (temporada_semana_progresso) num roll-up
 *    por colaborador, pra tela /admin/engajamento.
 */

const FORMATOS = ['video', 'audio', 'texto', 'case'];

/**
 * Loga a ABERTURA de um conteúdo da semana (deep-link da pílula). Best-effort:
 * NUNCA lança pro client. empresa/colaborador vêm da TRILHA (não do client), então
 * um evento jamais é atribuído a outro tenant. `pilula` (1|2) vem do ?p= do link.
 */
export async function registrarAberturaSemana(input: {
  trilhaId: string; semana: number; pilula?: number | null; formato?: string | null;
}) {
  try {
    await requireUserAction();
    const trilhaId = input?.trilhaId;
    const semana = Number(input?.semana);
    if (!trilhaId || !Number.isFinite(semana)) return { ok: false };

    const sb = createSupabaseAdmin();
    const { data: t } = await sb.from('trilhas')
      .select('empresa_id, colaborador_id').eq('id', trilhaId).maybeSingle();
    if (!t?.empresa_id) return { ok: false };

    const pilula = input.pilula === 1 || input.pilula === 2 ? input.pilula : null;
    const formato = FORMATOS.includes(String(input.formato)) ? input.formato : null;

    await sb.from('trilha_eventos').insert({
      empresa_id: t.empresa_id, colaborador_id: t.colaborador_id, trilha_id: trilhaId,
      semana, pilula, formato, tipo: 'abertura',
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** conteudo_consumido é boolean (marcarConteudoConsumido) OU array (video-tracking). */
function consumiu(v: any): boolean {
  if (v === true) return true;
  if (Array.isArray(v)) return v.some((x: any) => x?.concluido);
  return false;
}

/**
 * Roll-up de engajamento por colaborador (empresa). Retorna { resumo, colaboradores }.
 * Aberturas são atribuídas por pílula; stats de vídeo são por colaborador (o vídeo
 * personalizado dele), pois videos_watched não carrega semana.
 */
export async function getEngajamentoEmpresa(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return { resumo: null, colaboradores: [] };
  const sb = createSupabaseAdmin();

  // 1) População = inscritos na cadência (fase4_envios) + dados do colab.
  const { data: envios } = await sb.from('fase4_envios')
    .select('colaborador_id, semana_atual, status, ultima_pilula1_em, ultima_pilula2_em, colaboradores!inner(nome_completo, cargo)')
    .eq('empresa_id', empresaId);

  const colabIds = (envios || []).map((e: any) => e.colaborador_id);
  if (!colabIds.length) return { resumo: { inscritos: 0 }, colaboradores: [] };

  // 2) Aberturas (trilha_eventos) — por colaborador/pílula.
  const { data: aberturas } = await sb.from('trilha_eventos')
    .select('colaborador_id, pilula, semana, formato, criado_em')
    .eq('empresa_id', empresaId).eq('tipo', 'abertura');

  // 3) Playback de vídeo (videos_watched) — por colaborador.
  const { data: videos } = await sb.from('videos_watched')
    .select('colaborador_id, event_type, seconds_watched, video_length, created_at')
    .eq('empresa_id', empresaId)
    .in('event_type', ['play_started', 'play_progress', 'play_finished']);

  // 4) Consumo explícito (marcou concluído).
  const { data: progresso } = await sb.from('temporada_semana_progresso')
    .select('colaborador_id, semana, conteudo_consumido')
    .eq('empresa_id', empresaId);

  // Indexação por colaborador
  const abertPorColab: Record<string, any[]> = {};
  for (const a of (aberturas || [])) (abertPorColab[a.colaborador_id] ||= []).push(a);
  const vidPorColab: Record<string, any[]> = {};
  for (const v of (videos || [])) (vidPorColab[v.colaborador_id] ||= []).push(v);
  const consumoPorColab: Record<string, boolean> = {};
  for (const p of (progresso || [])) {
    if (consumiu(p.conteudo_consumido)) consumoPorColab[p.colaborador_id] = true;
  }

  const colaboradores = (envios || []).map((e: any) => {
    const abs = abertPorColab[e.colaborador_id] || [];
    const vids = vidPorColab[e.colaborador_id] || [];
    const p1 = abs.filter((a) => a.pilula === 1).length;
    const p2 = abs.filter((a) => a.pilula === 2).length;
    const direto = abs.filter((a) => !a.pilula).length;
    const primeiraAbertura = abs.length
      ? abs.map((a) => a.criado_em).sort()[0] : null;

    const deuPlay = vids.length > 0;   // qualquer evento (started/progress/finished) = deu play
    const terminouVideo = vids.some((v) => v.event_type === 'play_finished');
    const maxSeg = Math.max(0, ...vids.map((v) => Number(v.seconds_watched) || 0));
    const maxLen = Math.max(0, ...vids.map((v) => Number(v.video_length) || 0));
    const pctAssistido = terminouVideo ? 100 : (maxLen > 0 ? Math.min(100, Math.round((maxSeg / maxLen) * 100)) : 0);

    return {
      colaboradorId: e.colaborador_id,
      nome: e.colaboradores?.nome_completo || '—',
      cargo: e.colaboradores?.cargo || '',
      semanaAtual: e.semana_atual || 1,
      status: e.status,
      recebeuP1: !!e.ultima_pilula1_em,
      recebeuP2: !!e.ultima_pilula2_em,
      abriuLink: abs.length > 0,
      aberturasP1: p1, aberturasP2: p2, aberturasDireto: direto,
      primeiraAbertura,
      deuPlay,
      terminouVideo,
      pctAssistido,
      marcouConcluido: !!consumoPorColab[e.colaborador_id],
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome));

  const resumo = {
    inscritos: colaboradores.length,
    receberamP1: colaboradores.filter((c) => c.recebeuP1).length,
    receberamP2: colaboradores.filter((c) => c.recebeuP2).length,
    abriramLink: colaboradores.filter((c) => c.abriuLink).length,
    deramPlay: colaboradores.filter((c) => c.deuPlay).length,
    terminaramVideo: colaboradores.filter((c) => c.terminouVideo).length,
    marcaramConcluido: colaboradores.filter((c) => c.marcouConcluido).length,
    pctMedioAssistido: colaboradores.length
      ? Math.round(colaboradores.reduce((s, c) => s + c.pctAssistido, 0) / colaboradores.length) : 0,
  };

  return { resumo, colaboradores };
}
