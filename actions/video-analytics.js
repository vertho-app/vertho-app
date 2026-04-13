'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';

const DIAS_INATIVO = 14;

/**
 * Retorna { id, nome } da empresa (pra mostrar no header da tela de vídeos).
 */
export async function loadEmpresaInfo(empresaId) {
  try {
    if (!empresaId) return null;
    const sb = createSupabaseAdmin();
    const { data } = await sb.from('empresas').select('id, nome').eq('id', empresaId).maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

/**
 * Últimos N vídeos únicos assistidos pelo colab (dedup por video_id,
 * pega o evento mais recente de cada). Retorna com pct assistido e
 * flag de concluído.
 */
export async function loadUltimosVideosColab(email, limit = 3) {
  try {
    if (!email) return { error: 'email obrigatório' };
    const colab = await findColabByEmail(email, 'id');
    if (!colab) return { error: 'Colab não encontrado' };

    const sb = createSupabaseAdmin();
    const { data } = await sb.from('videos_watched')
      .select('video_id, seconds_watched, video_length, event_type, created_at')
      .eq('colaborador_id', colab.id)
      .order('created_at', { ascending: false })
      .limit(limit * 3); // overfetch pra poder deduplicar

    const seen = new Set();
    const items = [];
    for (const r of (data || [])) {
      if (!r.video_id || seen.has(r.video_id)) continue;
      seen.add(r.video_id);
      const length = Number(r.video_length) || 0;
      const watched = Number(r.seconds_watched) || 0;
      const pct = length > 0 ? Math.min(100, Math.round((watched / length) * 100)) : 0;
      items.push({
        videoId: r.video_id,
        secondsWatched: watched,
        videoLength: length,
        pct,
        concluido: r.event_type === 'play_finished' || pct >= 90,
        watchedAt: r.created_at,
      });
      if (items.length >= limit) break;
    }
    return { items };
  } catch (err) {
    console.error('[loadUltimosVideosColab]', err);
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Ranking de engajamento dos colabs da empresa (minutos assistidos).
 * Inclui quem nunca assistiu (valores zerados), útil pro admin ver
 * a cauda.
 */
export async function loadEngajamentoEmpresa(empresaId) {
  try {
    const sb = createSupabaseAdmin();

    // Se empresaId for null/undefined, agrega global (todas empresas)
    let colabsQuery = sb.from('colaboradores')
      .select('id, nome_completo, cargo, area_depto, foto_url, avatar_preset, mapeamento_em, empresa_id');
    let eventsQuery = sb.from('videos_watched')
      .select('colaborador_id, video_id, seconds_watched, created_at, event_type, empresa_id');
    if (empresaId) {
      colabsQuery = colabsQuery.eq('empresa_id', empresaId);
      eventsQuery = eventsQuery.eq('empresa_id', empresaId);
    }
    const { data: colabs } = await colabsQuery;
    const { data: events } = await eventsQuery;

    const porColab = {};
    let totalSegundosEmpresa = 0;
    let totalConcluidos = 0;
    for (const e of (events || [])) {
      if (!porColab[e.colaborador_id]) {
        porColab[e.colaborador_id] = {
          videosDistintos: new Set(),
          videosConcluidos: new Set(),
          totalSegundos: 0,
          totalViews: 0,
          ultimoAcesso: null,
        };
      }
      const c = porColab[e.colaborador_id];
      c.videosDistintos.add(e.video_id);
      if (e.event_type === 'play_finished') c.videosConcluidos.add(e.video_id);
      c.totalSegundos += Number(e.seconds_watched) || 0;
      c.totalViews += 1;
      totalSegundosEmpresa += Number(e.seconds_watched) || 0;
      if (e.event_type === 'play_finished') totalConcluidos += 1;
      if (!c.ultimoAcesso || new Date(e.created_at) > new Date(c.ultimoAcesso)) {
        c.ultimoAcesso = e.created_at;
      }
    }

    const ranking = (colabs || []).map(col => {
      const stats = porColab[col.id] || {
        videosDistintos: new Set(), videosConcluidos: new Set(),
        totalSegundos: 0, totalViews: 0, ultimoAcesso: null,
      };
      return {
        colabId: col.id,
        nome: col.nome_completo,
        cargo: col.cargo,
        area: col.area_depto,
        fotoUrl: col.foto_url,
        avatarPreset: col.avatar_preset,
        videosDistintos: stats.videosDistintos.size,
        videosConcluidos: stats.videosConcluidos.size,
        minutosAssistidos: Math.round(stats.totalSegundos / 60),
        totalViews: stats.totalViews,
        ultimoAcesso: stats.ultimoAcesso,
      };
    });

    ranking.sort((a, b) => b.minutosAssistidos - a.minutosAssistidos);

    return {
      ranking,
      totalColabs: ranking.length,
      totalHoras: Math.round(totalSegundosEmpresa / 3600 * 10) / 10,
      totalConcluidos,
      colabsAtivos: ranking.filter(r => r.totalViews > 0).length,
    };
  } catch (err) {
    console.error('[loadEngajamentoEmpresa]', err);
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Colabs com mapeamento realizado mas sem view há X+ dias (ou nunca).
 * Usado pra alertas de RH sobre quem está desengajado.
 */
export async function loadAlertasInatividade(empresaId, dias = DIAS_INATIVO) {
  try {
    const sb = createSupabaseAdmin();

    let colabsQuery = sb.from('colaboradores')
      .select('id, nome_completo, cargo, area_depto, mapeamento_em')
      .not('mapeamento_em', 'is', null);
    let eventsQuery = sb.from('videos_watched')
      .select('colaborador_id, created_at');
    if (empresaId) {
      colabsQuery = colabsQuery.eq('empresa_id', empresaId);
      eventsQuery = eventsQuery.eq('empresa_id', empresaId);
    }
    const { data: colabs } = await colabsQuery;
    const { data: events } = await eventsQuery;

    const ultimas = {};
    for (const e of (events || [])) {
      const cur = ultimas[e.colaborador_id];
      if (!cur || new Date(e.created_at) > new Date(cur)) {
        ultimas[e.colaborador_id] = e.created_at;
      }
    }

    const alertas = (colabs || []).map(c => {
      const ultima = ultimas[c.id];
      let diasSemAssistir = null;
      if (ultima) {
        diasSemAssistir = Math.floor((Date.now() - new Date(ultima).getTime()) / (24 * 3600 * 1000));
      }
      return {
        colabId: c.id,
        nome: c.nome_completo,
        cargo: c.cargo,
        area: c.area_depto,
        diasSemAssistir,
        ultimaView: ultima,
        nuncaAssistiu: !ultima,
      };
    }).filter(a => a.nuncaAssistiu || a.diasSemAssistir >= dias);

    alertas.sort((a, b) => {
      // Quem nunca assistiu primeiro, depois ordena por mais dias sem assistir
      if (a.nuncaAssistiu && !b.nuncaAssistiu) return -1;
      if (b.nuncaAssistiu && !a.nuncaAssistiu) return 1;
      return (b.diasSemAssistir || 0) - (a.diasSemAssistir || 0);
    });

    return { alertas, dias };
  } catch (err) {
    console.error('[loadAlertasInatividade]', err);
    return { error: err?.message || 'Erro' };
  }
}
