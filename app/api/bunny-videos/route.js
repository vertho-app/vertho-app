// Lista os vídeos da library do Bunny Stream para popular o carrossel
// "Capacitação Recomendada" da home. Cache de 5 minutos pra não bater na
// API a cada navegação.

export const revalidate = 300;

function cleanTitle(raw) {
  if (!raw) return 'Vídeo';
  // Remove extensão e prefixos numéricos típicos de stock footage
  let t = String(raw).replace(/\.(mp4|mov|webm|m4v|mkv)$/i, '');
  t = t.replace(/_/g, ' ').trim();
  // Se sobrar só números/dimensões (ex: "6563857 hd 1920 1080 25fps"), troca por algo neutro
  if (/^[\d\sx]+(?:hd|fps)?[\d\s]*$/i.test(t) || /^\d+ hd \d+ \d+ \d+fps$/i.test(t)) {
    return 'Sem título';
  }
  return t;
}

function formatDuration(sec) {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export async function GET() {
  const lib = process.env.BUNNY_LIBRARY_ID;
  const key = process.env.BUNNY_STREAM_API_KEY;

  if (!lib || !key) {
    return Response.json({ error: 'BUNNY_LIBRARY_ID/BUNNY_STREAM_API_KEY não configurados' }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://video.bunnycdn.com/library/${lib}/videos?page=1&itemsPerPage=50&orderBy=date`,
      {
        headers: { AccessKey: key, Accept: 'application/json' },
        next: { revalidate: 300 }, // Cache server-side de 5 min
      }
    );
    if (!res.ok) {
      return Response.json({ error: `Bunny API ${res.status}` }, { status: 502 });
    }
    const data = await res.json();

    // Filtra só vídeos prontos pra reprodução (status 4 = encoded) e ordena
    // do mais novo pro mais antigo
    const items = (data?.items || [])
      .filter(v => v?.status === 4 && v?.guid)
      .sort((a, b) => new Date(b.dateUploaded) - new Date(a.dateUploaded))
      .map(v => ({
        videoId: v.guid,
        titulo: cleanTitle(v.title),
        legenda: formatDuration(v.length),
        width: v.width,
        height: v.height,
        dateUploaded: v.dateUploaded,
      }));

    return Response.json({ items, total: items.length }, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('[bunny-videos]', err);
    return Response.json({ error: err?.message || 'Erro ao listar vídeos' }, { status: 500 });
  }
}
