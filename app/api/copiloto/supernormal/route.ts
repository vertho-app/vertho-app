import { NextResponse } from 'next/server';
import { requireRepresentativeOrAdminRequest } from '@/lib/copiloto/auth';
import { getSupernormalPost, isSupernormalConfigured, listSupernormalPosts } from '@/lib/copiloto/supernormal';
import { readLimiter } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const access = await requireRepresentativeOrAdminRequest(req);
    if (access instanceof Response) return access;
    // O token de ambiente pertence a uma conta individual. Até haver OAuth ou
    // segredo por representante, não podemos expor as reuniões dela ao canal.
    if (access.kind !== 'admin') {
      return NextResponse.json({ error: 'Integração Supernormal disponível apenas para administrador.' }, { status: 403 });
    }
    const limited = await readLimiter.check(req, access.email);
    if (limited) return limited;

    if (!isSupernormalConfigured()) {
      return NextResponse.json({ configured: false, posts: [] });
    }

    const url = new URL(req.url);
    const postId = url.searchParams.get('post_id')?.trim();
    if (postId) {
      return NextResponse.json({ configured: true, post: await getSupernormalPost(postId) });
    }
    return NextResponse.json({ configured: true, posts: await listSupernormalPosts() });
  } catch (error: any) {
    console.error('[copiloto/supernormal]', error?.message || error);
    return NextResponse.json({ error: 'Não foi possível ler as reuniões do Supernormal.' }, { status: 502 });
  }
}
