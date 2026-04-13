'use server';

/**
 * Actions que consultam a API do Bunny Stream pra gerar métricas.
 * Usa BUNNY_LIBRARY_ID e BUNNY_STREAM_API_KEY do env.
 */

const API_BASE = 'https://video.bunnycdn.com/library';

function getConfig() {
  const lib = process.env.BUNNY_LIBRARY_ID;
  const key = process.env.BUNNY_STREAM_API_KEY;
  if (!lib || !key) return null;
  return { lib, key };
}

async function bunnyFetch(path) {
  const cfg = getConfig();
  if (!cfg) throw new Error('Bunny não configurado (faltam BUNNY_LIBRARY_ID/BUNNY_STREAM_API_KEY)');
  const res = await fetch(`${API_BASE}/${cfg.lib}${path}`, {
    headers: { AccessKey: cfg.key, Accept: 'application/json' },
    next: { revalidate: 60 }, // Cache de 1 min
  });
  if (!res.ok) throw new Error(`Bunny API ${res.status}`);
  return res.json();
}

function limparTitulo(raw) {
  if (!raw) return 'Vídeo';
  let t = String(raw).replace(/\.(mp4|mov|webm|m4v|mkv)$/i, '').replace(/_/g, ' ').trim();
  if (/^[\d\s]+hd[\d\s]*\d+fps?$/i.test(t)) return 'Sem título';
  return t;
}

/**
 * Métricas por vídeo: views, watch time, taxa de conclusão.
 */
export async function loadBunnyVideosStats() {
  try {
    const data = await bunnyFetch('/videos?page=1&itemsPerPage=100&orderBy=date');
    const items = (data?.items || [])
      .filter(v => v?.status === 4 && v?.guid)
      .map(v => {
        const length = Number(v.length) || 0;
        const avg = Number(v.averageWatchTime) || 0;
        const taxa = length > 0 ? Math.min(100, Math.round((avg / length) * 100)) : 0;
        return {
          videoId: v.guid,
          titulo: limparTitulo(v.title),
          views: Number(v.views) || 0,
          length,
          averageWatchTime: avg,
          totalWatchTime: Number(v.totalWatchTime) || 0,
          taxaConclusao: taxa,
          dateUploaded: v.dateUploaded,
          storageSize: v.storageSize,
          width: v.width,
          height: v.height,
        };
      });

    // Agregados
    const totalViews = items.reduce((a, b) => a + b.views, 0);
    const totalWatchTimeSec = items.reduce((a, b) => a + b.totalWatchTime, 0);
    const mediaTaxaConclusao = items.length > 0
      ? Math.round(items.reduce((a, b) => a + b.taxaConclusao, 0) / items.length)
      : 0;

    // Ordena do mais assistido pro menos
    items.sort((a, b) => b.views - a.views);

    return {
      items,
      totalVideos: items.length,
      totalViews,
      totalHoras: Math.round(totalWatchTimeSec / 3600 * 10) / 10,
      mediaTaxaConclusao,
    };
  } catch (err) {
    console.error('[loadBunnyVideosStats]', err);
    return { error: err?.message || 'Erro ao consultar Bunny' };
  }
}

/**
 * Heatmap de um vídeo — objeto { segundo: %viewers }.
 */
export async function loadBunnyHeatmap(videoId) {
  try {
    if (!videoId) return { error: 'videoId obrigatório' };
    const data = await bunnyFetch(`/videos/${videoId}/heatmap`);
    const heatmap = data?.heatmap || {};
    // Converte pra array ordenado por segundo
    const points = Object.entries(heatmap)
      .map(([sec, pct]) => ({ sec: Number(sec), pct: Number(pct) || 0 }))
      .sort((a, b) => a.sec - b.sec);
    return { points };
  } catch (err) {
    console.error('[loadBunnyHeatmap]', err);
    return { error: err?.message || 'Erro ao buscar heatmap' };
  }
}

/**
 * Views por colaborador (a partir da tabela videos_watched alimentada pelo
 * webhook /api/webhooks/bunny). Retorna um mapa { colaboradorId: {videos, minutos} }.
 */
export async function loadVideoWatchedPorColab(empresaId) {
  try {
    const { createSupabaseAdmin } = await import('@/lib/supabase');
    const sb = createSupabaseAdmin();
    const { data, error } = await sb.from('videos_watched')
      .select('colaborador_id, video_id, seconds_watched')
      .eq('empresa_id', empresaId)
      .not('colaborador_id', 'is', null);
    if (error) return { error: error.message };

    const map = {};
    for (const r of (data || [])) {
      const k = r.colaborador_id;
      if (!map[k]) map[k] = { videosDistintos: new Set(), segundos: 0, views: 0 };
      map[k].videosDistintos.add(r.video_id);
      map[k].segundos += Number(r.seconds_watched) || 0;
      map[k].views += 1;
    }
    // Converte Set em count
    const resumo = Object.fromEntries(
      Object.entries(map).map(([k, v]) => [k, {
        videosDistintos: v.videosDistintos.size,
        segundos: v.segundos,
        minutos: Math.round(v.segundos / 60),
        views: v.views,
      }])
    );
    return { resumo };
  } catch (err) {
    console.error('[loadVideoWatchedPorColab]', err);
    return { error: err?.message };
  }
}

/**
 * Estatísticas agregadas da library (views por dia).
 */
export async function loadBunnyLibraryStats() {
  try {
    const data = await bunnyFetch('/statistics');
    const viewsChart = data?.viewsChart || {};
    const series = Object.entries(viewsChart)
      .map(([date, views]) => ({ date, views: Number(views) || 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { series };
  } catch (err) {
    console.error('[loadBunnyLibraryStats]', err);
    return { error: err?.message || 'Erro ao buscar statistics' };
  }
}
