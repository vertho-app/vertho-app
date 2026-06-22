import { NextResponse } from 'next/server';
import { gerarConteudoFinalPersonalizado } from '@/actions/conteudos';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Entrega LAZY do PDF de conteúdo final PERSONALIZADO (DISC + PPP) ao colaborador.
 * Resolve o email da sessão, gera-ou-serve-do-cache o PDF personalizado e
 * redireciona (302) para a URL pública. Qualquer falha cai na URL genérica.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

    const res = await gerarConteudoFinalPersonalizado({ contentId: id });
    if (!res.url) return NextResponse.json({ error: res.error || 'conteúdo indisponível' }, { status: 404 });
    return NextResponse.redirect(res.url, 302);
  } catch (err: any) {
    console.error('[/api/conteudo/[id]/pdf]', err);
    return NextResponse.json({ error: 'erro ao gerar PDF' }, { status: 500 });
  }
}
