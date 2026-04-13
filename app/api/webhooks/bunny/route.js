// Webhook do Bunny Stream — recebe eventos de reprodução e grava em
// videos_watched com atribuição por colaborador.
//
// Configuração no painel Bunny:
//   Stream → Library → Webhooks → Add Webhook
//     URL:    https://<seu-host>/api/webhooks/bunny
//     Events: Video Played, Video Finished
//
// Pra autorizar, configure BUNNY_WEBHOOK_SECRET no env (opcional). O Bunny
// pode enviar via header `Authorization` ou query param `token`. Se o secret
// estiver configurado, rejeita requests sem match.

import { createSupabaseAdmin } from '@/lib/supabase';

export async function POST(req) {
  try {
    // Validação do secret (opcional)
    const secret = process.env.BUNNY_WEBHOOK_SECRET;
    if (secret) {
      const auth = req.headers.get('authorization') || '';
      const tokenHeader = auth.replace(/^Bearer\s+/i, '');
      const tokenQuery = new URL(req.url).searchParams.get('token') || '';
      if (tokenHeader !== secret && tokenQuery !== secret) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    const payload = await req.json().catch(() => null);
    if (!payload) return new Response('Invalid JSON', { status: 400 });

    // O Bunny envia campos com nomes em PascalCase. Normalizamos.
    const videoId = payload.VideoGuid || payload.videoGuid || payload.video_guid || null;
    const libraryId = payload.VideoLibraryId || payload.videoLibraryId || null;
    const eventType = payload.Status != null ? `status_${payload.Status}` : (payload.event || 'unknown');
    const videoLength = Number(payload.VideoLength || payload.length || 0) || null;
    const secondsWatched = Number(payload.SecondsWatched || payload.seconds_watched || 0) || null;
    const country = payload.Country || payload.country || null;
    const os = payload.Os || payload.os || null;
    const browser = payload.Browser || payload.browser || null;

    // Meta data: o Bunny repassa o `metaData` que colocamos no embed.
    // Aceita também variações de casing.
    const metaData = payload.MetaData || payload.metaData || payload.metadata || null;

    // Derivamos colab + empresa a partir do metaData (esperado: "colab-{uuid}")
    let colaboradorId = null;
    let empresaId = null;
    if (metaData && typeof metaData === 'string') {
      const m = metaData.match(/colab-([a-f0-9-]{36})/i);
      if (m) colaboradorId = m[1];
    } else if (metaData && typeof metaData === 'object') {
      colaboradorId = metaData.colaboradorId || metaData.colabId || null;
      empresaId = metaData.empresaId || null;
    }

    // Se temos colab, buscamos empresa do colab (denormaliza pra query rápida)
    const sb = createSupabaseAdmin();
    if (colaboradorId && !empresaId) {
      const { data: c } = await sb.from('colaboradores')
        .select('empresa_id')
        .eq('id', colaboradorId)
        .maybeSingle();
      empresaId = c?.empresa_id || null;
    }

    const { error } = await sb.from('videos_watched').insert({
      colaborador_id: colaboradorId,
      empresa_id: empresaId,
      video_id: videoId,
      event_type: eventType,
      video_length: videoLength,
      seconds_watched: secondsWatched,
      country,
      os,
      browser,
      raw_payload: payload,
    });
    if (error) {
      console.error('[bunny webhook] insert erro:', error.message);
      return new Response('DB error', { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[bunny webhook]', err);
    return new Response('Internal error', { status: 500 });
  }
}

// Útil pro painel do Bunny testar conectividade via GET
export async function GET() {
  return Response.json({ ok: true, endpoint: 'bunny-webhook', time: new Date().toISOString() });
}
