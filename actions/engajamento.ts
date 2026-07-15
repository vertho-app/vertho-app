'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUserAction, requireAdminAction } from '@/lib/auth/action-context';

/**
 * Telemetria de engajamento da trilha. Duas frentes:
 *  - registrarEventoTrilha: loga eventos do colaborador na tela da semana —
 *    'abertura' (deep-link da pílula), 'formato' (abriu um formato: vídeo/áudio/
 *    texto/caso) e 'audio_fim' (terminou o áudio). Atribuição por pílula/formato.
 *  - getEngajamentoEmpresa: junta esses eventos + playback de vídeo (videos_watched)
 *    + consumo explícito (temporada_semana_progresso) num roll-up por colaborador,
 *    pra tela /admin/engajamento. Filtrável por semana; abertura/formato quebrados
 *    por pílula (P1/P2).
 */

const FORMATOS = ['video', 'audio', 'texto', 'case'];
const TIPOS = ['abertura', 'formato', 'audio_fim'];

/**
 * Loga um evento do colaborador na tela da semana. Best-effort: NUNCA lança pro
 * client. empresa/colaborador vêm da TRILHA (não do client) → nunca atribuído a
 * outro tenant. `pilula` (1|2) vem do ?p= ou do índice do descritor.
 */
export async function registrarEventoTrilha(input: {
  trilhaId: string; semana: number; pilula?: number | null; formato?: string | null; tipo?: string;
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
    const tipo = TIPOS.includes(String(input.tipo)) ? input.tipo : 'abertura';

    await sb.from('trilha_eventos').insert({
      empresa_id: t.empresa_id, colaborador_id: t.colaborador_id, trilha_id: trilhaId,
      semana, pilula, formato, tipo,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** conteudo_consumido é boolean (marcarConteudoConsumido) OU array (video-tracking). */
function consumiuFlag(v: any): boolean {
  if (v === true) return true;
  if (Array.isArray(v)) return v.some((x: any) => x?.concluido);
  return false;
}

const fmtsDistintos = (evs: any[], pilula: number | null) =>
  [...new Set(
    evs.filter((x) => x.formato && (x.tipo === 'formato' || x.tipo === 'abertura')
      && (pilula == null || x.pilula === pilula)).map((x) => x.formato),
  )];

/**
 * Roll-up de engajamento por colaborador. `semana` filtra os eventos de abertura/
 * formato/consumo; se null, agrega todas. Retorna { resumo, colaboradores, semanas }.
 * Stats de VÍDEO (play/%/terminou) filtram por semana quando há filtro; eventos de
 * vídeo legados (sem semana=NULL) contam em qualquer filtro.
 */
export async function getEngajamentoEmpresa(empresaId: string, semana?: number | null) {
  await requireAdminAction();
  if (!empresaId) return { resumo: null, colaboradores: [], semanas: [] };
  const sb = createSupabaseAdmin();
  const semFiltro = Number.isFinite(Number(semana)) && Number(semana) > 0 ? Number(semana) : null;

  // 1) População = inscritos na cadência.
  const { data: envios } = await sb.from('fase4_envios')
    .select('colaborador_id, semana_atual, status, ultima_pilula1_em, ultima_pilula2_em, colaboradores!inner(nome_completo, cargo)')
    .eq('empresa_id', empresaId);
  if (!envios?.length) return { resumo: { inscritos: 0 }, colaboradores: [], semanas: [1] };

  // 2) Eventos (opcionalmente escopados por semana).
  let evQuery = sb.from('trilha_eventos')
    .select('colaborador_id, pilula, semana, formato, tipo, criado_em').eq('empresa_id', empresaId);
  if (semFiltro) evQuery = evQuery.eq('semana', semFiltro);
  const { data: eventos } = await evQuery;

  // 3) Playback de vídeo — escopado por semana quando há filtro; eventos legados
  //    sem semana (NULL) contam em qualquer filtro.
  let vidQuery = sb.from('videos_watched')
    .select('colaborador_id, event_type, seconds_watched, video_length')
    .eq('empresa_id', empresaId).in('event_type', ['play_started', 'play_progress', 'play_finished']);
  if (semFiltro) vidQuery = vidQuery.or(`semana.eq.${semFiltro},semana.is.null`);
  const { data: videos } = await vidQuery;

  // 4) Consumo explícito (opcionalmente por semana).
  let progQuery = sb.from('temporada_semana_progresso')
    .select('colaborador_id, semana, conteudo_consumido').eq('empresa_id', empresaId);
  if (semFiltro) progQuery = progQuery.eq('semana', semFiltro);
  const { data: progresso } = await progQuery;

  const evPorColab: Record<string, any[]> = {};
  for (const a of (eventos || [])) (evPorColab[a.colaborador_id] ||= []).push(a);
  const vidPorColab: Record<string, any[]> = {};
  for (const v of (videos || [])) (vidPorColab[v.colaborador_id] ||= []).push(v);
  const consumoPorColab: Record<string, boolean> = {};
  for (const p of (progresso || [])) {
    if (consumiuFlag(p.conteudo_consumido)) consumoPorColab[p.colaborador_id] = true;
  }

  const colaboradores = (envios || []).map((e: any) => {
    const evs = evPorColab[e.colaborador_id] || [];
    const vids = vidPorColab[e.colaborador_id] || [];

    const abriuP1 = evs.some((x) => x.tipo === 'abertura' && x.pilula === 1);
    const abriuP2 = evs.some((x) => x.tipo === 'abertura' && x.pilula === 2);
    const abriuDireto = evs.some((x) => x.tipo === 'abertura' && !x.pilula);
    const formatosP1 = fmtsDistintos(evs, 1);
    const formatosP2 = fmtsDistintos(evs, 2);
    const audioTerminou = evs.some((x) => x.tipo === 'audio_fim');

    const deuPlay = vids.length > 0;
    const terminouVideo = vids.some((v) => v.event_type === 'play_finished');
    const maxSeg = Math.max(0, ...vids.map((v) => Number(v.seconds_watched) || 0));
    const maxLen = Math.max(0, ...vids.map((v) => Number(v.video_length) || 0));
    const pctVideo = terminouVideo ? 100 : (maxLen > 0 ? Math.min(100, Math.round((maxSeg / maxLen) * 100)) : 0);

    // FIX paradoxo: formatosAbertos DERIVA vídeo/áudio do playback real (quem terminou
    // o vídeo obviamente abriu o formato vídeo, mesmo sem evento 'formato').
    const setFmt = new Set(fmtsDistintos(evs, null));
    if (deuPlay) setFmt.add('video');
    if (audioTerminou) setFmt.add('audio');
    const formatosAbertos = [...setFmt];

    const marcouConcluido = !!consumoPorColab[e.colaborador_id];
    const consumiu = terminouVideo || audioTerminou || marcouConcluido;

    return {
      colaboradorId: e.colaborador_id,
      nome: e.colaboradores?.nome_completo || '—',
      cargo: e.colaboradores?.cargo || '',
      semanaAtual: e.semana_atual || 1,
      status: e.status,
      recebeuP1: !!e.ultima_pilula1_em,
      recebeuP2: !!e.ultima_pilula2_em,
      abriuP1, abriuP2, abriuDireto,
      abriuLink: abriuP1 || abriuP2 || abriuDireto,
      formatosP1, formatosP2, formatosAbertos,
      deuPlay, terminouVideo, audioTerminou, pctVideo,
      marcouConcluido, consumiu,
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome));

  const resumo = {
    inscritos: colaboradores.length,
    semanaFiltro: semFiltro,
    abriramLink: colaboradores.filter((c) => c.abriuLink).length,
    abriramAlgumFormato: colaboradores.filter((c) => c.formatosAbertos.length > 0).length,
    terminaramVideo: colaboradores.filter((c) => c.terminouVideo).length,
    consumiram: colaboradores.filter((c) => c.consumiu).length,
    pctMedioVideo: colaboradores.length
      ? Math.round(colaboradores.reduce((s, c) => s + c.pctVideo, 0) / colaboradores.length) : 0,
  };

  const maxSemana = Math.max(1, ...(envios || []).map((e: any) => Number(e.semana_atual) || 1));
  const semanas = Array.from({ length: maxSemana }, (_, i) => i + 1);

  return { resumo, colaboradores, semanas };
}
