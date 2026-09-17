import { NextResponse } from 'next/server';
import { checarAcessoPlataforma } from '@/lib/authz-plataforma';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import {
  guardarMidiaRecebida,
  urlDaCopia,
  idDeMidiaValido,
  MENSAGEM_MIDIA_EXPIRADA,
} from '@/lib/inbox/midia-recebida';

/**
 * Mídia de uma conversa do WhatsApp, para a tela da caixa de entrada.
 *
 * A ORDEM IMPORTA
 * ───────────────
 * 1. **A nossa cópia** (bucket `inbox-midia-recebida`, mig 259). É o caminho
 *    normal: o webhook guarda o arquivo quando a mensagem chega.
 * 2. **A Meta**, só se não há cópia, e já guardando. A Meta APAGA a mídia em
 *    poucos dias (medido 17/09/2026: 19 de 23 já tinham sumido), então esta é a
 *    última chance de uma mídia cuja cópia falhou no webhook.
 * 3. **410** com a frase para a tela quando nenhum dos dois tem o arquivo. Um
 *    404 mudo virava imagem quebrada e áudio "0:00" sem explicação.
 *
 * POR QUE REDIRECT, e não o binário
 * ─────────────────────────────────
 * A Vercel corta a resposta da função em 4,5 MB, e áudio chega a 16 MB. O
 * redirect para a URL assinada também entrega `Range` ao player, que é o que
 * permite avançar no áudio.
 *
 * O token da Meta nunca sai daqui: a URL da Graph exige o token no header, e
 * repassá-la ao browser vazaria a credencial que envia mensagem pela empresa.
 *
 * ⚠️ ROTA AUTENTICADA: `checarAcessoPlataforma` no topo. Sem ele, um id de mídia
 * (adivinhável em ordem de grandeza, e vaza em log) daria acesso a áudio de
 * conversa de colaborador para quem chamasse a URL.
 */

export const dynamic = 'force-dynamic';
// Baixar da Meta e subir para o Storage cabe folgado; o teto padrão não.
export const maxDuration = 60;

function redirecionar(url: string) {
  const res = NextResponse.redirect(url, 307);
  // A URL assinada muda a cada chamada e é de uma sessão só.
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

export async function GET(_req: Request, ctx: { params: Promise<{ mediaId: string }> }) {
  const acesso = await checarAcessoPlataforma();
  if (!acesso.authorized) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }

  const { mediaId } = await ctx.params;
  if (!idDeMidiaValido(mediaId)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const sb = await requireAdminSupabase();

  const copia = await urlDaCopia(mediaId, sb);
  if (copia) return redirecionar(copia);

  const guarda = await guardarMidiaRecebida(mediaId, sb);

  if (guarda.estado === 'guardada' || guarda.estado === 'ja-guardada') {
    const nova = await urlDaCopia(mediaId, sb);
    if (nova) return redirecionar(nova);
  }

  if (guarda.estado === 'expirada') {
    return NextResponse.json({ error: MENSAGEM_MIDIA_EXPIRADA, expirada: true }, { status: 410 });
  }

  // Chegou aqui com o arquivo em mãos = o Storage falhou. A cópia é o que
  // protege o arquivo do prazo da Meta, então a falha fica registrada; mas
  // quem está olhando a conversa vê o arquivo mesmo assim.
  console.error('[inbox/midia] sem cópia:', guarda.estado, guarda.reason);
  await registrarDegradacao({
    fluxo: 'envio',
    tipo: DEGRADACAO.WHATSAPP_MIDIA_NAO_GUARDADA,
    chave: 'proxy',
    severidade: 'aviso',
    detalhe: { mediaId, estado: guarda.estado, motivo: guarda.reason ?? null },
  });

  if (guarda.body) {
    return new NextResponse(guarda.body as any, {
      status: 200,
      headers: {
        'Content-Type': guarda.mime || 'application/octet-stream',
        // `private`: conteúdo de conversa de uma pessoa identificável. Cache
        // compartilhado (CDN) serviria o áudio de um colaborador a outra sessão.
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': 'inline',
      },
    });
  }

  return NextResponse.json(
    { error: 'Não foi possível buscar este arquivo agora. Tente de novo em alguns minutos.' },
    { status: 502 },
  );
}
