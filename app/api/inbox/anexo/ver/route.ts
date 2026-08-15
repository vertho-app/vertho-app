import { NextResponse } from 'next/server';
import { checarAcessoPlataforma } from '@/lib/authz-plataforma';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { BUCKET_ANEXOS, TTL_LINK_SEGUNDOS } from '@/lib/inbox/anexos';

/**
 * GET /api/inbox/anexo/ver?path=… — mostra na thread o anexo que a equipe mandou.
 *
 * POR QUE PRECISA EXISTIR: o anexo enviado por `link` não tem `media id` da
 * Meta (ela re-hospeda e não devolve um), então o proxy de mídia recebida não
 * serve para ele. Sem esta rota, o arquivo aparece na conversa da pessoa e
 * some da tela de quem mandou — a mesma metade de conversa que o inbox existe
 * para eliminar.
 *
 * ⚠️ O `path` vem da URL, então é tratado como entrada hostil: só caminho
 * dentro do bucket privado, sem `..`, e a rota é autenticada. O que ela devolve
 * é um redirect para uma URL assinada de vida curta — o bucket nunca fica
 * público.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const acesso = await checarAcessoPlataforma();
  if (!acesso.authorized) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }

  const path = new URL(req.url).searchParams.get('path') || '';
  // Sem `..` e sem barra inicial: caminho montado com valor externo é como se
  // escapa de prefixo no storage.
  if (!path || path.includes('..') || path.startsWith('/')) {
    return NextResponse.json({ error: 'caminho inválido' }, { status: 400 });
  }

  const sb = await requireAdminSupabase();
  const { data, error } = await sb.storage.from(BUCKET_ANEXOS).createSignedUrl(path, TTL_LINK_SEGUNDOS);
  if (error || !data?.signedUrl) {
    // Some depois da limpeza: dizer isso é melhor que um 404 mudo, porque o
    // arquivo REALMENTE não existe mais — a conversa da pessoa segue com ele.
    console.error('[inbox/anexo/ver]', error?.message);
    return NextResponse.json(
      { error: 'anexo não está mais disponível aqui (a cópia local expira; no WhatsApp ele continua)' },
      { status: 404 },
    );
  }

  return NextResponse.redirect(data.signedUrl, 307);
}
