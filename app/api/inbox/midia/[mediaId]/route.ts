import { NextResponse } from 'next/server';
import { checarAcessoPlataforma } from '@/lib/authz-plataforma';
import { urlDaMidia, baixarMidia } from '@/lib/whatsapp/cloud-api';

/**
 * Proxy autenticado de mídia recebida pelo WhatsApp.
 *
 * POR QUE PROXY, e não link direto
 * ────────────────────────────────
 * A URL que a Meta devolve para uma mídia **exige o token no header** — ela não
 * é pública e expira em poucos minutos. Repassá-la ao browser não funcionaria; e
 * "resolver" isso mandando o token junto vazaria a credencial que envia mensagem
 * em nome da empresa, para qualquer um com o DevTools aberto. O servidor busca e
 * transmite; o token nunca sai daqui.
 *
 * POR QUE ISTO IMPORTA: no Brasil, áudio é o formato mais provável de resposta
 * de um colaborador. Uma caixa de entrada que mostra "recebeu um áudio" sem
 * deixar ouvir obriga quem atende a responder sem saber o que foi dito.
 *
 * ⚠️ ROTA AUTENTICADA: `checarAcessoPlataforma` no topo. Sem ele, um id de mídia
 * — que é adivinhável em ordem de grandeza e vaza em qualquer log — daria acesso
 * a áudio de conversa de colaborador para quem chamasse a URL.
 */

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ mediaId: string }> }) {
  const acesso = await checarAcessoPlataforma();
  if (!acesso.authorized) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }

  const { mediaId } = await ctx.params;
  // O id da Meta é numérico. Validar antes de usar impede que a rota vire um
  // fetcher genérico com o nosso token, apontável para qualquer caminho da Graph.
  if (!/^\d{5,25}$/.test(mediaId)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const meta = await urlDaMidia(mediaId);
  if (!meta.ok || !meta.url) {
    console.error('[inbox/midia] url:', meta.reason);
    return NextResponse.json({ error: 'mídia indisponível' }, { status: 404 });
  }

  const arquivo = await baixarMidia(meta.url);
  if (!arquivo.ok || !arquivo.body) {
    console.error('[inbox/midia] download:', arquivo.reason);
    return NextResponse.json({ error: 'falha ao baixar' }, { status: 502 });
  }

  return new NextResponse(arquivo.body as any, {
    status: 200,
    headers: {
      'Content-Type': arquivo.mime || meta.mime || 'application/octet-stream',
      // `private`: é conteúdo de conversa de uma pessoa identificável. Cache
      // compartilhado (CDN) serviria o áudio de um colaborador para outra sessão.
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline',
    },
  });
}
